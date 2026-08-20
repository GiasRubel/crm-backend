import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AuditActor, AuditService, diffFields } from '../audit/audit.service';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { UsersService } from '../users/users.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamQueryDto } from './dto/team-query.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import { TeamStatsDto } from './dto/team-stats.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { toTeamResponseDto } from './mappers/team.mapper';
import { Team, TeamDocument } from './team.schema';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    @InjectModel(Team.name)
    private readonly teamModel: Model<TeamDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateTeamDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamResponseDto> {
    const name = dto.name.trim();
    await this.assertNameAvailable(name, organizationId);

    const { memberIds, leaderId } = await this.resolveMembership(
      organizationId,
      dto.memberIds ?? [],
      dto.leaderId ?? null,
    );

    const team = await this.teamModel.create({
      organizationId,
      name,
      description: dto.description?.trim(),
      regions: this.normalizeRegions(dto.regions),
      memberIds,
      leaderId: leaderId ?? undefined,
      isActive: dto.isActive ?? true,
      createdBy,
    });

    this.logger.log(`Team created: ${team.name} (${team._id.toString()})`);
    void this.auditService.log({
      organizationId,
      actor: { id: createdBy },
      action: 'create',
      entityType: 'team',
      entityId: team._id.toString(),
      entityLabel: team.name,
      summary: `Created team "${team.name}"`,
      after: team.toObject(),
    });
    return this.toResponse(team);
  }

  async findAll(query: TeamQueryDto, organizationId: Types.ObjectId) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId };

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { regions: searchRegex },
      ];
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    // Secondary _id sort keeps pagination stable when the primary key has ties
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total] = await Promise.all([
      this.teamModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.teamModel.countDocuments(filter).exec(),
    ]);

    const data = await this.toResponses(items);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStats(organizationId: Types.ObjectId): Promise<TeamStatsDto> {
    const [total, active, memberAgg, assignedCustomers] = await Promise.all([
      this.teamModel.countDocuments({ organizationId }).exec(),
      this.teamModel.countDocuments({ organizationId, isActive: true }).exec(),
      this.teamModel
        .aggregate<{
          _id: null;
          members: string[];
        }>([
          { $match: { organizationId } },
          { $unwind: '$memberIds' },
          { $group: { _id: null, members: { $addToSet: '$memberIds' } } },
        ])
        .exec(),
      this.customerModel
        .countDocuments({ organizationId, assignedTeamId: { $ne: null } })
        .exec(),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      totalMembers: memberAgg[0]?.members.length ?? 0,
      assignedCustomers,
    };
  }

  async findOne(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamResponseDto> {
    const team = await this.getByIdOrFail(id, organizationId);
    return this.toResponse(team);
  }

  /** Teams the calling staff user belongs to (active teams only). */
  async findMyTeams(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamResponseDto[]> {
    const teams = await this.teamModel
      .find({ organizationId, memberIds: keycloakId, isActive: true })
      .sort({ name: 1 })
      .exec();
    return this.toResponses(teams);
  }

  /**
   * Territory routing: find the first active team whose regions contain the
   * given region tag (case-insensitive exact tag match).
   */
  async matchRegion(
    region: string,
    organizationId: Types.ObjectId,
  ): Promise<{ team: TeamResponseDto | null }> {
    const tag = region.trim();
    if (!tag) return { team: null };

    const team = await this.teamModel
      .findOne({
        organizationId,
        isActive: true,
        regions: { $regex: `^${escapeRegExp(tag)}$`, $options: 'i' },
      })
      .exec();

    return { team: team ? await this.toResponse(team) : null };
  }

  async update(
    id: string,
    dto: UpdateTeamDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<TeamResponseDto> {
    const team = await this.getByIdOrFail(id, organizationId);
    const before = team.toObject();

    const updates: Partial<Team> = {};
    const unsets: Record<string, ''> = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== team.name) {
        await this.assertNameAvailable(name, organizationId);
        updates.name = name;
      }
    }

    if (dto.description !== undefined)
      updates.description = dto.description.trim();
    if (dto.regions !== undefined)
      updates.regions = this.normalizeRegions(dto.regions);
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    if (dto.memberIds !== undefined || dto.leaderId !== undefined) {
      const requestedLeader =
        dto.leaderId !== undefined ? dto.leaderId : (team.leaderId ?? null);
      const requestedMembers = dto.memberIds ?? team.memberIds;

      const { memberIds, leaderId } = await this.resolveMembership(
        organizationId,
        requestedMembers,
        requestedLeader,
        // Only auto-clear a stale leader when the leader wasn't explicitly set
        // in this request; an explicit leader outside the member list is an error.
        dto.leaderId === undefined,
      );

      updates.memberIds = memberIds;
      if (leaderId) {
        updates.leaderId = leaderId;
      } else {
        unsets.leaderId = '';
      }
    }

    const updated = await this.teamModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys(updates).length > 0 ? { $set: updates } : {}),
          ...(Object.keys(unsets).length > 0 ? { $unset: unsets } : {}),
        },
        { new: true },
      )
      .orFail()
      .exec();

    this.logger.log(`Team updated: ${updated.name} (${id})`);
    const changes = diffFields(before, updated.toObject(), [
      'name',
      'description',
      'regions',
      'memberIds',
      'leaderId',
      'isActive',
    ]);
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor,
        action: 'update',
        entityType: 'team',
        entityId: id,
        entityLabel: updated.name,
        summary: `Updated team "${updated.name}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    return this.toResponse(updated);
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const team = await this.getByIdOrFail(id, organizationId);

    // Route safety: customers assigned to the deleted team return to the
    // unassigned pool (visible to admins only) instead of pointing at a ghost.
    const { modifiedCount } = await this.customerModel
      .updateMany(
        { assignedTeamId: team._id },
        { $unset: { assignedTeamId: '' } },
      )
      .exec();

    await this.teamModel.deleteOne({ _id: team._id }).exec();
    this.logger.log(
      `Team deleted: ${team.name} (${id}); ${modifiedCount} customer(s) unassigned`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'team',
      entityId: id,
      entityLabel: team.name,
      summary: `Deleted team "${team.name}"`,
      before: team.toObject(),
    });
  }

  // ── Helpers used by other modules ─────────────────────────────────────────

  /** Ids of active teams the given staff user belongs to. Used for row-level visibility. */
  async getTeamIdsForMember(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const teams = await this.teamModel
      .find({ organizationId, memberIds: keycloakId, isActive: true })
      .select('_id')
      .exec();
    return teams.map((t) => t._id);
  }

  /** Raw team document lookup (null on missing/malformed id). */
  async findDocById(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamDocument | null> {
    if (!isValidObjectId(id)) return null;
    return this.teamModel.findOne({ _id: id, organizationId }).exec();
  }

  /** Map of teamId → team name, for denormalizing names into other responses. */
  async findNamesByIds(
    ids: string[],
    organizationId: Types.ObjectId,
  ): Promise<Map<string, string>> {
    const validIds = ids.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) return new Map();
    const teams = await this.teamModel
      .find({ _id: { $in: validIds }, organizationId })
      .select('name')
      .exec();
    return new Map(teams.map((t) => [t._id.toString(), t.name]));
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async assertNameAvailable(
    name: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const existing = await this.teamModel
      .findOne({
        organizationId,
        name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
      })
      .exec();
    if (existing) {
      throw new ConflictException('A team with this name already exists');
    }
  }

  /**
   * Validate and normalize team membership:
   * - members must be existing staff users (Customer-role users are rejected)
   * - the leader must be a member; a newly set leader is auto-added,
   *   a stale leader (dropped from members) is cleared when allowed.
   */
  private async resolveMembership(
    organizationId: Types.ObjectId,
    requestedMemberIds: string[],
    requestedLeaderId: string | null,
    clearStaleLeader = false,
  ): Promise<{ memberIds: string[]; leaderId: string | null }> {
    const memberIds = [
      ...new Set(requestedMemberIds.map((id) => id.trim()).filter(Boolean)),
    ];
    let leaderId = requestedLeaderId?.trim() || null;

    if (leaderId && !memberIds.includes(leaderId)) {
      if (clearStaleLeader) {
        leaderId = null;
      } else {
        memberIds.push(leaderId);
      }
    }

    if (memberIds.length > 0) {
      const staff = await this.usersService.findStaffByKeycloakIds(
        memberIds,
        organizationId,
      );
      if (staff.length !== memberIds.length) {
        const found = new Set(staff.map((u) => u.keycloakId));
        const missing = memberIds.filter((id) => !found.has(id));
        throw new BadRequestException(
          `The following members are not valid staff users: ${missing.join(', ')}`,
        );
      }
    }

    return { memberIds, leaderId };
  }

  private normalizeRegions(regions?: string[]): string[] {
    return [...new Set((regions ?? []).map((r) => r.trim()).filter(Boolean))];
  }

  private async toResponse(team: TeamDocument): Promise<TeamResponseDto> {
    const [dto] = await this.toResponses([team]);
    return dto;
  }

  /** Batch-map documents: one staff lookup + one customer count aggregate per page. */
  private async toResponses(teams: TeamDocument[]): Promise<TeamResponseDto[]> {
    if (teams.length === 0) return [];
    // Every document in a mapping batch came from one org-scoped query, so
    // deriving the tenant from the batch itself cannot pick the wrong org.
    const organizationId = teams[0].organizationId;

    const allMemberIds = [...new Set(teams.flatMap((t) => t.memberIds))];

    const [staff, counts] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(allMemberIds, organizationId),
      this.customerModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { assignedTeamId: { $in: teams.map((t) => t._id) } } },
          { $group: { _id: '$assignedTeamId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const usersById = new Map(staff.map((u) => [u.keycloakId, u]));
    const countByTeam = new Map(counts.map((c) => [c._id.toString(), c.count]));

    return teams.map((team) =>
      toTeamResponseDto(
        team,
        usersById,
        countByTeam.get(team._id.toString()) ?? 0,
      ),
    );
  }

  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Team with ID ${id} not found`);
    }
    const team = await this.teamModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!team) {
      throw new NotFoundException(`Team with ID ${id} not found`);
    }
    return team;
  }
}
