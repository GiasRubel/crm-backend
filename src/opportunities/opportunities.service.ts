import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import {
  AuditActor,
  AuditService,
  diffFields,
  omitFields,
} from '../audit/audit.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomersService } from '../customers/customers.service';
import { CrmEventBus } from '../events/crm-event-bus.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toCsv } from '../import-export/csv.util';
import type { FieldRestrictionInfo } from '../roles/permissions.service';
import { PermissionsService } from '../roles/permissions.service';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { UsersService } from '../users/users.service';
import { AssignOpportunityDto } from './dto/assign-opportunity.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { OpportunityQueryDto } from './dto/opportunity-query.dto';
import { OpportunityResponseDto } from './dto/opportunity-response.dto';
import {
  OpportunityStatsDto,
  StageBucketDto,
} from './dto/opportunity-stats.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { toOpportunityResponseDto } from './mappers/opportunity.mapper';
import {
  CLOSED_STAGES,
  Opportunity,
  OPPORTUNITY_STAGES,
  OpportunityDocument,
  OpportunityStage,
  STAGE_PROBABILITY,
} from './opportunity.schema';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cards per column returned by the Kanban board endpoint. */
const BOARD_COLUMN_LIMIT = 100;

/** Cap CSV exports at a sane row count to keep the response fast and memory-bounded. */
const EXPORT_ROW_LIMIT = 5000;

/** Top-level fields tracked for the update-diff audit entry. */
const OPPORTUNITY_AUDIT_FIELDS = [
  'name',
  'amount',
  'probability',
  'accountId',
  'customFields',
];

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly customersService: CustomersService,
    private readonly accountsService: AccountsService,
    private readonly eventBus: CrmEventBus,
    private readonly auditService: AuditService,
    private readonly customFieldsService: CustomFieldsService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Publish an opportunity domain event for the automation engine. */
  private emitOpportunityEvent(
    event: 'opportunity.created' | 'opportunity.stage_changed',
    opportunity: OpportunityDocument,
    context: Record<string, unknown> = {},
  ): void {
    this.eventBus.emit({
      event,
      recordType: 'opportunity',
      recordId: opportunity._id.toString(),
      record: opportunity.toObject() as unknown as Record<string, unknown>,
      context,
    });
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(
    dto: CreateOpportunityDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityResponseDto> {
    await this.permissionsService.requirePermission(
      createdBy,
      organizationId,
      'opportunity',
      'create',
    );
    const customer = await this.customersService.findDocById(
      dto.customerId,
      organizationId,
    );
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    let accountObjectId: Types.ObjectId | undefined;
    if (dto.accountId) {
      const account = await this.accountsService.findDocById(
        dto.accountId,
        organizationId,
      );
      if (!account) {
        throw new BadRequestException('Linked account not found');
      }
      accountObjectId = account._id;
    }

    const assignment = await this.resolveAssignmentTargets(
      organizationId,
      dto.assignedToId,
      dto.assignedTeamId,
    );

    const stage = dto.stage ?? 'discovery';
    const customFields = await this.customFieldsService.validateAndMerge(
      'opportunity',
      undefined,
      dto.customFields,
      organizationId,
    );

    const opportunity = await this.opportunityModel.create({
      organizationId,
      name: dto.name.trim(),
      customerId: customer._id,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      customFields,
      accountId: accountObjectId,
      amount: dto.amount,
      stage,
      probability: dto.probability ?? STAGE_PROBABILITY[stage],
      expectedCloseDate: dto.expectedCloseDate
        ? new Date(dto.expectedCloseDate)
        : undefined,
      notes: dto.notes?.trim(),
      createdBy,
      ...assignment,
    });

    this.logger.log(
      `Opportunity created: "${opportunity.name}" (${stage}, ${opportunity.amount})`,
    );
    this.emitOpportunityEvent('opportunity.created', opportunity);
    void this.auditService.log({
      organizationId,
      actor: { id: createdBy },
      action: 'create',
      entityType: 'opportunity',
      entityId: opportunity._id.toString(),
      entityLabel: opportunity.name,
      summary: `Created opportunity "${opportunity.name}"`,
      after: omitFields(opportunity.toObject(), ['stageHistory']),
    });
    return this.mapOne(opportunity);
  }

  // ── Read ────────────────────────────────────────────────────────────────

  private async buildListFilter(
    query: OpportunityQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({ name: searchRegex });
    }
    if (query.stage) conditions.push({ stage: query.stage });
    if (query.customerId) {
      conditions.push({ customerId: new Types.ObjectId(query.customerId) });
    }
    if (query.accountId) {
      conditions.push({ accountId: new Types.ObjectId(query.accountId) });
    }

    const visibility = await this.buildVisibilityFilter(
      requesterKeycloakId,
      organizationId,
    );
    if (visibility) conditions.push(visibility);

    return conditions.length === 0
      ? {}
      : conditions.length === 1
        ? conditions[0]
        : { $and: conditions };
  }

  async findAll(
    query: OpportunityQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter = await this.buildListFilter(
      query,
      requesterKeycloakId,
      organizationId,
    );

    const sortBy = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    // Secondary _id sort keeps pagination stable when the primary key has ties
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total, fieldRestrictions] = await Promise.all([
      this.opportunityModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.opportunityModel.countDocuments(filter).exec(),
      this.getFieldRestrictions(requesterKeycloakId, organizationId),
    ]);

    return {
      data: await this.mapMany(items, fieldRestrictions),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Kanban board: every stage as a column with its visible deals and value
   * totals. Columns are capped at BOARD_COLUMN_LIMIT cards (most recently
   * updated first); `count`/`totalAmount` always reflect the full column.
   */
  async getBoard(requesterKeycloakId: string, organizationId: Types.ObjectId) {
    const [visibilityFilter, fieldRestrictions] = await Promise.all([
      this.buildVisibilityFilter(requesterKeycloakId, organizationId),
      this.getFieldRestrictions(requesterKeycloakId, organizationId),
    ]);
    const visibility = { organizationId, ...(visibilityFilter ?? {}) };

    const columns = await Promise.all(
      OPPORTUNITY_STAGES.map(async (stage) => {
        const filter = { ...visibility, stage };
        const [items, count, amountAgg] = await Promise.all([
          this.opportunityModel
            .find(filter)
            .sort({ updatedAt: -1, _id: -1 })
            .limit(BOARD_COLUMN_LIMIT)
            .exec(),
          this.opportunityModel.countDocuments(filter).exec(),
          this.opportunityModel
            .aggregate<{
              _id: null;
              total: number;
            }>([
              { $match: filter },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            .exec(),
        ]);

        return {
          stage,
          count,
          totalAmount: amountAgg[0]?.total ?? 0,
          opportunities: await this.mapMany(items, fieldRestrictions),
        };
      }),
    );

    return { columns };
  }

  async getStats(
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityStatsDto> {
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

    const [byStage, weighted, wonThisMonth] = await Promise.all([
      this.opportunityModel
        .aggregate<{ _id: OpportunityStage; count: number; total: number }>([
          { $match: visibility },
          {
            $group: {
              _id: '$stage',
              count: { $sum: 1 },
              total: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      this.opportunityModel
        .aggregate<{ _id: null; total: number }>([
          { $match: { ...visibility, stage: { $nin: CLOSED_STAGES } } },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $divide: [{ $multiply: ['$amount', '$probability'] }, 100],
                },
              },
            },
          },
        ])
        .exec(),
      this.opportunityModel
        .aggregate<{ _id: null; count: number; total: number }>([
          {
            $match: {
              ...visibility,
              stage: 'closed_won',
              closedAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
    ]);

    const buckets = new Map(byStage.map((b) => [b._id, b]));
    const bucket = (stage: OpportunityStage): StageBucketDto => ({
      stage,
      count: buckets.get(stage)?.count ?? 0,
      totalAmount: buckets.get(stage)?.total ?? 0,
    });

    const openBuckets = OPPORTUNITY_STAGES.filter(
      (s) => !CLOSED_STAGES.includes(s),
    ).map(bucket);
    const won = bucket('closed_won');
    const lost = bucket('closed_lost');
    const closedTotal = won.count + lost.count;

    return {
      openCount: openBuckets.reduce((acc, b) => acc + b.count, 0),
      openValue: openBuckets.reduce((acc, b) => acc + b.totalAmount, 0),
      weightedValue: Math.round(weighted[0]?.total ?? 0),
      wonThisMonthCount: wonThisMonth[0]?.count ?? 0,
      wonThisMonthValue: wonThisMonth[0]?.total ?? 0,
      winRate:
        closedTotal === 0 ? 0 : Math.round((won.count / closedTotal) * 100),
      byStage: OPPORTUNITY_STAGES.map(bucket),
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityResponseDto> {
    const opportunity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(opportunity, requesterKeycloakId, organizationId);
    const fieldRestrictions = await this.getFieldRestrictions(
      requesterKeycloakId,
      organizationId,
    );
    return this.mapOne(opportunity, fieldRestrictions);
  }

  // ── Update & pipeline moves ─────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateOpportunityDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityResponseDto> {
    const { fieldRestrictions } =
      await this.permissionsService.requirePermission(
        requesterKeycloakId,
        organizationId,
        'opportunity',
        'update',
      );
    const opportunity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(opportunity, requesterKeycloakId, organizationId);
    const before = opportunity.toObject();

    if (dto.name !== undefined) opportunity.name = dto.name.trim();
    if (dto.amount !== undefined) opportunity.amount = dto.amount;
    if (dto.probability !== undefined)
      opportunity.probability = dto.probability;
    if (dto.expectedCloseDate !== undefined) {
      opportunity.expectedCloseDate = new Date(dto.expectedCloseDate);
    }
    if (dto.notes !== undefined) opportunity.notes = dto.notes.trim();

    // Account link: omitted = unchanged, null = unlink, id = validated & set
    if (dto.accountId !== undefined) {
      if (dto.accountId === null) {
        opportunity.accountId = undefined;
      } else {
        const account = await this.accountsService.findDocById(
          dto.accountId,
          organizationId,
        );
        if (!account) {
          throw new BadRequestException('Linked account not found');
        }
        opportunity.accountId = account._id;
      }
    }

    if (dto.customFields !== undefined) {
      const sanitized = this.permissionsService.stripReadonlyFieldChanges(
        opportunity.customFields,
        dto.customFields,
        fieldRestrictions,
      );
      opportunity.customFields =
        await this.customFieldsService.validateAndMerge(
          'opportunity',
          opportunity.customFields,
          sanitized,
          organizationId,
        );
    }

    await opportunity.save();
    this.logger.log(`Opportunity updated: ${id}`);
    const changes = diffFields(
      before,
      opportunity.toObject(),
      OPPORTUNITY_AUDIT_FIELDS,
    );
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor: { id: requesterKeycloakId },
        action: 'update',
        entityType: 'opportunity',
        entityId: id,
        entityLabel: opportunity.name,
        summary: `Updated opportunity "${opportunity.name}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    return this.mapOne(opportunity);
  }

  /**
   * Move a deal to another stage (Kanban drag). Rules:
   * - moving to the current stage is a no-op
   * - closed_lost requires a lostReason
   * - entering a closed stage stamps closedAt; reopening clears it
   * - probability snaps to the target stage's default
   * - every move is appended to stageHistory
   */
  async moveStage(
    id: string,
    dto: MoveStageDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityResponseDto> {
    await this.permissionsService.requirePermission(
      requesterKeycloakId,
      organizationId,
      'opportunity',
      'update',
    );
    const opportunity = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(opportunity, requesterKeycloakId, organizationId);

    const from = opportunity.stage;
    const to = dto.stage;

    if (from === to) {
      return this.mapOne(opportunity);
    }

    if (to === 'closed_lost' && !dto.lostReason?.trim()) {
      throw new BadRequestException(
        'A lost reason is required when marking a deal as lost',
      );
    }

    opportunity.stage = to;
    opportunity.probability = STAGE_PROBABILITY[to];
    opportunity.stageHistory.push({
      from,
      to,
      movedBy: requesterKeycloakId,
      movedAt: new Date(),
    });

    if (CLOSED_STAGES.includes(to)) {
      opportunity.closedAt = new Date();
      opportunity.lostReason =
        to === 'closed_lost' ? dto.lostReason!.trim() : undefined;
    } else {
      // Reopened deal goes back into the working pipeline
      opportunity.closedAt = undefined;
      opportunity.lostReason = undefined;
    }

    await opportunity.save();
    this.logger.log(`Opportunity ${id} moved: ${from} → ${to}`);
    this.emitOpportunityEvent('opportunity.stage_changed', opportunity, {
      previousStage: from,
      newStage: to,
    });
    void this.auditService.log({
      organizationId,
      actor: { id: requesterKeycloakId },
      action: 'stage_change',
      entityType: 'opportunity',
      entityId: id,
      entityLabel: opportunity.name,
      summary: `Moved opportunity "${opportunity.name}" from ${from} to ${to}`,
      changes: [{ field: 'stage', from, to }],
      metadata: dto.lostReason ? { lostReason: dto.lostReason } : undefined,
    });
    return this.mapOne(opportunity);
  }

  /**
   * Record routing: set or clear the record owner and/or the assigned team.
   * Omitted fields are unchanged; null clears a field.
   */
  async assign(
    id: string,
    dto: AssignOpportunityDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityResponseDto> {
    await this.permissionsService.requirePermission(
      actor.id ?? '',
      organizationId,
      'opportunity',
      'update',
    );
    const opportunity = await this.getByIdOrFail(id, organizationId);

    const sets: Record<string, unknown> = {};
    const unsets: Record<string, ''> = {};
    // undefined = team untouched by this request; null = cleared
    let targetTeam: TeamDocument | null | undefined;

    if (dto.assignedTeamId !== undefined) {
      if (dto.assignedTeamId === null) {
        unsets.assignedTeamId = '';
        targetTeam = null;
      } else {
        targetTeam = await this.getActiveTeamOrFail(dto.assignedTeamId, organizationId);
        sets.assignedTeamId = targetTeam._id;
      }
    }

    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId === null) {
        unsets.assignedToId = '';
      } else {
        await this.getStaffUserOrFail(dto.assignedToId, organizationId);
        sets.assignedToId = dto.assignedToId;
      }
    }

    if (Object.keys(sets).length === 0 && Object.keys(unsets).length === 0) {
      return this.mapOne(opportunity);
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    const finalOwner =
      dto.assignedToId === undefined
        ? (opportunity.assignedToId ?? null)
        : dto.assignedToId;
    const finalTeam =
      targetTeam !== undefined
        ? targetTeam
        : opportunity.assignedTeamId
          ? await this.teamsService.findDocById(
              opportunity.assignedTeamId.toString(),
              organizationId,
            )
          : null;

    if (finalOwner && finalTeam && !finalTeam.memberIds.includes(finalOwner)) {
      throw new BadRequestException(
        'Record owner must be a member of the assigned team',
      );
    }

    const updated = await this.opportunityModel
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
      `Opportunity ${id} routed: owner=${updated.assignedToId ?? 'none'}, team=${updated.assignedTeamId?.toString() ?? 'none'}`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'assign',
      entityType: 'opportunity',
      entityId: id,
      entityLabel: updated.name,
      summary: `Reassigned opportunity "${updated.name}"`,
      changes: diffFields(opportunity.toObject(), updated.toObject(), [
        'assignedToId',
        'assignedTeamId',
      ]),
    });
    if (dto.assignedToId) {
      void this.notificationsService.notify({
        organizationId,
        recipientId: updated.assignedToId,
        actorId: actor.id,
        type: 'assignment',
        title: 'Opportunity assigned to you',
        body: updated.name,
        entityType: 'opportunity',
        entityId: updated._id,
      });
    }
    return this.mapOne(updated);
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    await this.permissionsService.requirePermission(
      actor.id ?? '',
      organizationId,
      'opportunity',
      'delete',
    );
    const opportunity = await this.getByIdOrFail(id, organizationId);
    await this.opportunityModel.deleteOne({ _id: opportunity._id }).exec();
    this.logger.log(`Opportunity deleted: ${id}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'opportunity',
      entityId: id,
      entityLabel: opportunity.name,
      summary: `Deleted opportunity "${opportunity.name}"`,
      before: omitFields(opportunity.toObject(), ['stageHistory']),
    });
  }

  // ── Row-level visibility (governed by PermissionsService) ──────────────

  private async buildVisibilityFilter(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    const { scope } = await this.permissionsService.requirePermission(
      keycloakId,
      organizationId,
      'opportunity',
      'read',
    );
    if (scope === 'all') return null;
    const teamIds = await this.teamsService.getTeamIdsForMember(
      keycloakId,
      organizationId,
    );
    return this.permissionsService.buildVisibilityFilter(
      scope,
      keycloakId,
      teamIds,
    );
  }

  /** 404 (not 403) outside the caller's scope, to avoid leaking existence. */
  private async assertCanView(
    opportunity: OpportunityDocument,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const { scope } = await this.permissionsService.requirePermission(
      keycloakId,
      organizationId,
      'opportunity',
      'read',
    );
    const inScope = await this.permissionsService.isRecordInScope(
      scope,
      keycloakId,
      organizationId,
      opportunity,
    );
    if (!inScope) {
      throw new NotFoundException(
        `Opportunity with ID ${opportunity._id.toString()} not found`,
      );
    }
  }

  private async getFieldRestrictions(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Map<string, FieldRestrictionInfo>> {
    const { fieldRestrictions } =
      await this.permissionsService.getEffectivePermission(
        keycloakId,
        organizationId,
        'opportunity',
        'read',
      );
    return fieldRestrictions;
  }

  // ── Assignment helpers ──────────────────────────────────────────────────

  /** Validate optional routing targets on opportunity creation. */
  private async resolveAssignmentTargets(
    organizationId: Types.ObjectId,
    assignedToId?: string,
    assignedTeamId?: string,
  ): Promise<{ assignedToId?: string; assignedTeamId?: Types.ObjectId }> {
    const result: { assignedToId?: string; assignedTeamId?: Types.ObjectId } =
      {};

    let team: TeamDocument | null = null;
    if (assignedTeamId) {
      team = await this.getActiveTeamOrFail(assignedTeamId, organizationId);
      result.assignedTeamId = team._id;
    }

    if (assignedToId) {
      await this.getStaffUserOrFail(assignedToId, organizationId);
      if (team && !team.memberIds.includes(assignedToId)) {
        throw new BadRequestException(
          'Record owner must be a member of the assigned team',
        );
      }
      result.assignedToId = assignedToId;
    }

    return result;
  }

  private async getActiveTeamOrFail(
    teamId: string,
    organizationId: Types.ObjectId,
  ): Promise<TeamDocument> {
    const team = await this.teamsService.findDocById(teamId, organizationId);
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

  private async getStaffUserOrFail(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const [owner] = await this.usersService.findStaffByKeycloakIds(
      [keycloakId],
      organizationId,
    );
    if (!owner) {
      throw new BadRequestException(
        'Record owner must be an existing staff user',
      );
    }
  }

  // ── Mapping ─────────────────────────────────────────────────────────────

  private async mapOne(
    opportunity: OpportunityDocument,
    fieldRestrictions?: Map<string, FieldRestrictionInfo>,
  ): Promise<OpportunityResponseDto> {
    const [dto] = await this.mapMany([opportunity], fieldRestrictions);
    return dto;
  }

  /** Batch-denormalize staff/team/customer names (one lookup per collection per page). */
  private async mapMany(
    opportunities: OpportunityDocument[],
    fieldRestrictions: Map<string, FieldRestrictionInfo> = new Map(),
  ): Promise<OpportunityResponseDto[]> {
    if (opportunities.length === 0) return [];
    // Every document in a mapping batch came from one org-scoped query, so
    // deriving the tenant from the batch itself cannot pick the wrong org.
    const organizationId = opportunities[0].organizationId;

    const staffIds = [
      ...new Set(
        opportunities
          .flatMap((o) => [
            o.assignedToId,
            ...o.stageHistory.map((t) => t.movedBy),
          ])
          .filter((v): v is string => !!v),
      ),
    ];
    const teamIds = [
      ...new Set(
        opportunities
          .map((o) => o.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];
    const customerIds = [
      ...new Set(opportunities.map((o) => o.customerId.toString())),
    ];
    const accountIds = [
      ...new Set(
        opportunities
          .map((o) => o.accountId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];

    const [staff, teamNames, customerNames, accountNames] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(staffIds, organizationId),
      this.teamsService.findNamesByIds(teamIds, organizationId),
      this.customersService.findNamesByIds(customerIds, organizationId),
      this.accountsService.findNamesByIds(accountIds, organizationId),
    ]);

    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return opportunities.map((o) => {
      const dto = toOpportunityResponseDto(o, {
        staffNames,
        teamNames,
        customerNames,
        accountNames,
      });
      dto.customFields =
        this.permissionsService.applyFieldVisibility(
          dto.customFields,
          fieldRestrictions,
        ) ?? {};
      return dto;
    });
  }

  /** Load an opportunity by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<OpportunityDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Opportunity with ID ${id} not found`);
    }
    const opportunity = await this.opportunityModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!opportunity) {
      throw new NotFoundException(`Opportunity with ID ${id} not found`);
    }
    return opportunity;
  }

  // ── Export ───────────────────────────────────────────────────────────────

  async exportCsv(
    query: OpportunityQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<string> {
    const filter = await this.buildListFilter(
      query,
      requesterKeycloakId,
      organizationId,
    );
    const opportunities = await this.opportunityModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(EXPORT_ROW_LIMIT)
      .exec();

    const header = [
      'Name',
      'Stage',
      'Amount',
      'Probability',
      'Expected Close Date',
      'Closed At',
      'Created At',
    ];
    const rows = opportunities.map((o) => [
      o.name,
      o.stage,
      o.amount,
      o.probability,
      o.expectedCloseDate?.toISOString() ?? '',
      o.closedAt?.toISOString() ?? '',
      o.createdAt?.toISOString() ?? '',
    ]);
    return toCsv(header, rows);
  }
}
