import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AuditActor, AuditService, diffFields } from '../audit/audit.service';
import { Contact, ContactDocument } from '../contacts/contact.schema';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  CLOSED_STAGES,
  Opportunity,
  OpportunityDocument,
} from '../opportunities/opportunity.schema';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import { Account, AccountDocument } from './account.schema';
import { AccountQueryDto } from './dto/account-query.dto';
import { AccountResponseDto } from './dto/account-response.dto';
import { AccountStatsDto } from './dto/account-stats.dto';
import { AccountSummaryDto } from './dto/account-summary.dto';
import { AssignAccountDto } from './dto/assign-account.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { toAccountResponseDto } from './mappers/account.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rows shown in the 360° summary lists. */
const SUMMARY_LIST_LIMIT = 50;

/** Top-level fields tracked for the update-diff audit entry. */
const ACCOUNT_AUDIT_FIELDS = [
  'name',
  'industry',
  'website',
  'email',
  'phone',
  'size',
  'annualRevenue',
  'status',
  'customFields',
];

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>,
    // Read/unlink-only access to linked collections. The write paths for
    // these documents stay in their own modules; registering the models here
    // avoids a module dependency cycle (contacts/opportunities import
    // AccountsModule for validation, not the other way around).
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly auditService: AuditService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  // ── Create / update ─────────────────────────────────────────────────────

  async create(
    dto: CreateAccountDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<AccountResponseDto> {
    await this.assertNameAvailable(dto.name, organizationId);

    const assignment = await this.resolveAssignmentTargets(
      dto.assignedToId,
      dto.assignedTeamId,
    );
    const customFields = await this.customFieldsService.validateAndMerge(
      'account',
      undefined,
      dto.customFields,
      organizationId,
    );

    const account = await this.accountModel.create({
      organizationId,
      name: dto.name.trim(),
      industry: dto.industry,
      website: dto.website?.trim(),
      email: dto.email?.trim().toLowerCase(),
      phone: dto.phone?.trim(),
      size: dto.size,
      annualRevenue: dto.annualRevenue,
      address: dto.address?.trim(),
      description: dto.description?.trim(),
      status: dto.status ?? 'prospect',
      createdBy,
      customFields,
      ...assignment,
    });

    this.logger.log(`Account created: "${account.name}"`);
    void this.auditService.log({
      organizationId,
      actor: { id: createdBy },
      action: 'create',
      entityType: 'account',
      entityId: account._id.toString(),
      entityLabel: account.name,
      summary: `Created account "${account.name}"`,
      after: account.toObject(),
    });
    return this.mapOne(account);
  }

  async update(
    id: string,
    dto: UpdateAccountDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<AccountResponseDto> {
    const account = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(account, requesterKeycloakId, organizationId);
    const before = account.toObject();

    if (dto.name !== undefined) {
      const newName = dto.name.trim();
      if (newName.toLowerCase() !== account.name.toLowerCase()) {
        await this.assertNameAvailable(newName, organizationId);
      }
      account.name = newName;
    }
    if (dto.industry !== undefined) account.industry = dto.industry;
    if (dto.website !== undefined) account.website = dto.website.trim();
    if (dto.email !== undefined) account.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) account.phone = dto.phone.trim();
    if (dto.size !== undefined) account.size = dto.size;
    if (dto.annualRevenue !== undefined)
      account.annualRevenue = dto.annualRevenue;
    if (dto.address !== undefined) account.address = dto.address.trim();
    if (dto.description !== undefined)
      account.description = dto.description.trim();
    if (dto.status !== undefined) account.status = dto.status;
    if (dto.customFields !== undefined) {
      account.customFields = await this.customFieldsService.validateAndMerge(
        'account',
        account.customFields,
        dto.customFields,
        organizationId,
      );
    }

    await account.save();
    this.logger.log(`Account updated: ${id}`);
    const changes = diffFields(
      before,
      account.toObject(),
      ACCOUNT_AUDIT_FIELDS,
    );
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor: { id: requesterKeycloakId },
        action: 'update',
        entityType: 'account',
        entityId: id,
        entityLabel: account.name,
        summary: `Updated account "${account.name}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    return this.mapOne(account);
  }

  // ── Read ────────────────────────────────────────────────────────────────

  async findAll(
    query: AccountQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { name: searchRegex },
          { website: searchRegex },
          { email: searchRegex },
          { address: searchRegex },
        ],
      });
    }
    if (query.industry) conditions.push({ industry: query.industry });
    if (query.size) conditions.push({ size: query.size });
    if (query.status) conditions.push({ status: query.status });

    const visibility = await this.buildVisibilityFilter(
      requesterKeycloakId,
      organizationId,
    );
    if (visibility) conditions.push(visibility);

    const filter: Record<string, unknown> =
      conditions.length === 0
        ? {}
        : conditions.length === 1
          ? conditions[0]
          : { $and: conditions };

    const sortBy = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    // Secondary _id sort keeps pagination stable when the primary key has ties
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total] = await Promise.all([
      this.accountModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.accountModel.countDocuments(filter).exec(),
    ]);

    return {
      data: await this.mapMany(items),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStats(
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<AccountStatsDto> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const visibility = {
      organizationId,
      ...((await this.buildVisibilityFilter(
        requesterKeycloakId,
        organizationId,
      )) ?? {}),
    };

    const [byStatus, total, newThisMonth] = await Promise.all([
      this.accountModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          { $match: visibility },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.accountModel.countDocuments(visibility).exec(),
      this.accountModel
        .countDocuments({ ...visibility, createdAt: { $gte: startOfMonth } })
        .exec(),
    ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

    return {
      total,
      prospect: counts['prospect'] ?? 0,
      active: counts['active'] ?? 0,
      inactive: counts['inactive'] ?? 0,
      newThisMonth,
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<AccountResponseDto> {
    const account = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(account, requesterKeycloakId, organizationId);
    return this.mapOne(account);
  }

  /**
   * 360-degree view: account profile + linked contacts + linked deals +
   * value totals. Linked records are shown for any account the caller may
   * view (list limits: SUMMARY_LIST_LIMIT rows each; metrics cover all).
   */
  async getSummary(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<AccountSummaryDto> {
    const account = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(account, requesterKeycloakId, organizationId);

    const [contacts, contactCount, opportunities, valueAgg] = await Promise.all(
      [
        this.contactModel
          .find({ accountId: account._id })
          .sort({ isPrimary: -1, lastName: 1, _id: 1 })
          .limit(SUMMARY_LIST_LIMIT)
          .exec(),
        this.contactModel.countDocuments({ accountId: account._id }).exec(),
        this.opportunityModel
          .find({ accountId: account._id })
          .sort({ updatedAt: -1, _id: -1 })
          .limit(SUMMARY_LIST_LIMIT)
          .exec(),
        this.opportunityModel
          .aggregate<{ _id: string; total: number; count: number }>([
            { $match: { accountId: account._id } },
            {
              $group: {
                _id: '$stage',
                total: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ])
          .exec(),
      ],
    );

    const byStage = new Map(valueAgg.map((v) => [v._id, v]));
    const stageValue = (stage: string) => byStage.get(stage)?.total ?? 0;
    const openStages = [...byStage.entries()].filter(
      ([stage]) => !CLOSED_STAGES.includes(stage as never),
    );

    return {
      account: await this.mapOne(account),
      contacts: contacts.map((c) => ({
        id: c._id.toString(),
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone ?? null,
        jobTitle: c.jobTitle ?? null,
        isPrimary: c.isPrimary,
        preferredChannel: c.preferredChannel,
        doNotContact: c.doNotContact,
      })),
      opportunities: opportunities.map((o) => ({
        id: o._id.toString(),
        name: o.name,
        stage: o.stage,
        amount: o.amount,
        expectedCloseDate: o.expectedCloseDate?.toISOString() ?? null,
        closedAt: o.closedAt?.toISOString() ?? null,
      })),
      metrics: {
        contactCount,
        openDealCount: openStages.reduce((acc, [, v]) => acc + v.count, 0),
        openValue: openStages.reduce((acc, [, v]) => acc + v.total, 0),
        wonValue: stageValue('closed_won'),
        lostValue: stageValue('closed_lost'),
      },
    };
  }

  // ── Routing & delete ────────────────────────────────────────────────────

  /**
   * Record routing: set or clear the record owner and/or the assigned team.
   * Omitted fields are unchanged; null clears a field.
   */
  async assign(
    id: string,
    dto: AssignAccountDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<AccountResponseDto> {
    const account = await this.getByIdOrFail(id, organizationId);

    const sets: Record<string, unknown> = {};
    const unsets: Record<string, ''> = {};
    // undefined = team untouched by this request; null = cleared
    let targetTeam: TeamDocument | null | undefined;

    if (dto.assignedTeamId !== undefined) {
      if (dto.assignedTeamId === null) {
        unsets.assignedTeamId = '';
        targetTeam = null;
      } else {
        targetTeam = await this.getActiveTeamOrFail(dto.assignedTeamId);
        sets.assignedTeamId = targetTeam._id;
      }
    }

    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId === null) {
        unsets.assignedToId = '';
      } else {
        await this.getStaffUserOrFail(dto.assignedToId);
        sets.assignedToId = dto.assignedToId;
      }
    }

    if (Object.keys(sets).length === 0 && Object.keys(unsets).length === 0) {
      return this.mapOne(account);
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    const finalOwner =
      dto.assignedToId === undefined
        ? (account.assignedToId ?? null)
        : dto.assignedToId;
    const finalTeam =
      targetTeam !== undefined
        ? targetTeam
        : account.assignedTeamId
          ? await this.teamsService.findDocById(
              account.assignedTeamId.toString(),
            )
          : null;

    if (finalOwner && finalTeam && !finalTeam.memberIds.includes(finalOwner)) {
      throw new BadRequestException(
        'Record owner must be a member of the assigned team',
      );
    }

    const updated = await this.accountModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys(sets).length > 0 ? { $set: sets } : {}),
          ...(Object.keys(unsets).length > 0 ? { $unset: unsets } : {}),
        },
        { new: true },
      )
      .orFail()
      .exec();

    this.logger.log(
      `Account ${id} routed: owner=${updated.assignedToId ?? 'none'}, team=${updated.assignedTeamId?.toString() ?? 'none'}`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'assign',
      entityType: 'account',
      entityId: id,
      entityLabel: updated.name,
      summary: `Reassigned account "${updated.name}"`,
      changes: diffFields(account.toObject(), updated.toObject(), [
        'assignedToId',
        'assignedTeamId',
      ]),
    });
    return this.mapOne(updated);
  }

  /**
   * Deleting an account keeps its people and deals: linked contacts and
   * opportunities are unlinked (accountId cleared), never cascaded.
   */
  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const account = await this.getByIdOrFail(id, organizationId);

    const [contactResult, opportunityResult] = await Promise.all([
      this.contactModel
        .updateMany(
          { accountId: account._id },
          { $unset: { accountId: '' }, $set: { isPrimary: false } },
        )
        .exec(),
      this.opportunityModel
        .updateMany({ accountId: account._id }, { $unset: { accountId: '' } })
        .exec(),
    ]);

    await this.accountModel.deleteOne({ _id: account._id }).exec();
    this.logger.log(
      `Account deleted: ${id} (unlinked ${contactResult.modifiedCount} contacts, ${opportunityResult.modifiedCount} opportunities)`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'account',
      entityId: id,
      entityLabel: account.name,
      summary: `Deleted account "${account.name}"`,
      before: account.toObject(),
    });
  }

  // ── Cross-module lookups (used by contacts/opportunities) ──────────────

  /** Raw document lookup for other modules; null for malformed/unknown ids. */
  async findDocById(id: string): Promise<AccountDocument | null> {
    if (!isValidObjectId(id)) return null;
    return this.accountModel.findById(id).exec();
  }

  /** Map of account id → name for response denormalization. */
  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const accounts = await this.accountModel
      .find({ _id: { $in: ids } })
      .select('name')
      .exec();
    return new Map(accounts.map((a) => [a._id.toString(), a.name]));
  }

  // ── Row-level visibility (same model as CustomersService) ──────────────

  /**
   * Build the Mongo filter limiting what the caller may see.
   * Returns null for Admin/Administrator (unrestricted). Regular staff
   * (AppRole.User) see records they own, records routed to one of their
   * active teams, or records they created.
   */
  private async buildVisibilityFilter(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    if (!appUser) {
      throw new ForbiddenException('No app user record for this account');
    }

    if (
      appUser.role === AppRole.Admin ||
      appUser.role === AppRole.Administrator
    ) {
      return null;
    }

    const teamIds = await this.teamsService.getTeamIdsForMember(
      keycloakId,
      organizationId,
    );
    return {
      $or: [
        { assignedToId: keycloakId },
        { assignedTeamId: { $in: teamIds } },
        { createdBy: keycloakId },
      ],
    };
  }

  /** 404 (not 403) outside the caller's scope, to avoid leaking existence. */
  private async assertCanView(
    account: AccountDocument,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    if (!appUser) {
      throw new ForbiddenException('No app user record for this account');
    }
    if (
      appUser.role === AppRole.Admin ||
      appUser.role === AppRole.Administrator
    ) {
      return;
    }
    if (
      account.assignedToId === keycloakId ||
      account.createdBy === keycloakId
    ) {
      return;
    }
    if (account.assignedTeamId) {
      const teamIds = await this.teamsService.getTeamIdsForMember(
        keycloakId,
        organizationId,
      );
      if (teamIds.some((teamId) => teamId.equals(account.assignedTeamId))) {
        return;
      }
    }
    throw new NotFoundException(
      `Account with ID ${account._id.toString()} not found`,
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async assertNameAvailable(
    name: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const existing = await this.accountModel
      .findOne({
        organizationId,
        name: { $regex: `^${escapeRegExp(name.trim())}$`, $options: 'i' },
      })
      .exec();
    if (existing) {
      throw new ConflictException('An account with this name already exists');
    }
  }

  /** Validate optional routing targets on account creation. */
  private async resolveAssignmentTargets(
    assignedToId?: string,
    assignedTeamId?: string,
  ): Promise<{ assignedToId?: string; assignedTeamId?: Types.ObjectId }> {
    const result: { assignedToId?: string; assignedTeamId?: Types.ObjectId } =
      {};

    let team: TeamDocument | null = null;
    if (assignedTeamId) {
      team = await this.getActiveTeamOrFail(assignedTeamId);
      result.assignedTeamId = team._id;
    }

    if (assignedToId) {
      await this.getStaffUserOrFail(assignedToId);
      if (team && !team.memberIds.includes(assignedToId)) {
        throw new BadRequestException(
          'Record owner must be a member of the assigned team',
        );
      }
      result.assignedToId = assignedToId;
    }

    return result;
  }

  private async getActiveTeamOrFail(teamId: string): Promise<TeamDocument> {
    const team = await this.teamsService.findDocById(teamId);
    if (!team) {
      throw new BadRequestException('Assigned team not found');
    }
    if (!team.isActive) {
      throw new BadRequestException(
        'Records cannot be routed to an inactive team',
      );
    }
    return team;
  }

  private async getStaffUserOrFail(keycloakId: string): Promise<void> {
    const [owner] = await this.usersService.findStaffByKeycloakIds([
      keycloakId,
    ]);
    if (!owner) {
      throw new BadRequestException(
        'Record owner must be an existing staff user',
      );
    }
  }

  // ── Mapping ─────────────────────────────────────────────────────────────

  private async mapOne(account: AccountDocument): Promise<AccountResponseDto> {
    const [dto] = await this.mapMany([account]);
    return dto;
  }

  /** Batch-denormalize names and link counts (one lookup per collection per page). */
  private async mapMany(
    accounts: AccountDocument[],
  ): Promise<AccountResponseDto[]> {
    if (accounts.length === 0) return [];

    const accountIds = accounts.map((a) => a._id);
    const staffIds = [
      ...new Set(
        accounts.map((a) => a.assignedToId).filter((v): v is string => !!v),
      ),
    ];
    const teamIds = [
      ...new Set(
        accounts
          .map((a) => a.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];

    const [staff, teamNames, contactAgg, dealAgg] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(staffIds),
      this.teamsService.findNamesByIds(teamIds),
      this.contactModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { accountId: { $in: accountIds } } },
          { $group: { _id: '$accountId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.opportunityModel
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              accountId: { $in: accountIds },
              stage: { $nin: CLOSED_STAGES },
            },
          },
          { $group: { _id: '$accountId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );
    const contactCounts = new Map(
      contactAgg.map((c) => [c._id.toString(), c.count]),
    );
    const openDealCounts = new Map(
      dealAgg.map((d) => [d._id.toString(), d.count]),
    );

    return accounts.map((a) =>
      toAccountResponseDto(a, {
        staffNames,
        teamNames,
        contactCounts,
        openDealCounts,
      }),
    );
  }

  /** Load an account by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<AccountDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }
    const account = await this.accountModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }
    return account;
  }
}
