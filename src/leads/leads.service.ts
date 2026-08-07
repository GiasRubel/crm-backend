import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditActor,
  AuditService,
  diffFields,
  omitFields,
} from '../audit/audit.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  ImportResultDto,
  MAX_IMPORT_ROWS,
  runImport,
} from '../import-export/import-result.dto';
import { parseCsvToRecords, toCsv } from '../import-export/csv.util';
import { CustomersService } from '../customers/customers.service';
import { CrmEventBus } from '../events/crm-event-bus.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import { AddEngagementDto } from './dto/add-engagement.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CaptureLeadDto } from './dto/capture-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { LeadResponseDto } from './dto/lead-response.dto';
import { LeadStatsDto } from './dto/lead-stats.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import {
  ENGAGEMENT_DEFAULT_POINTS,
  EngagementType,
  Lead,
  LEAD_RATING_THRESHOLDS,
  LeadDocument,
  LeadEngagement,
  OPEN_LEAD_STATUSES,
} from './lead.schema';
import { computeScore, toLeadResponseDto } from './mappers/lead.mapper';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Engagement types that imply a rep actually reached the lead. */
const CONTACT_ENGAGEMENTS: readonly EngagementType[] = [
  'call',
  'meeting',
  'email_replied',
];

/** Cap CSV exports at a sane row count to keep the response fast and memory-bounded. */
const EXPORT_ROW_LIMIT = 5000;

/** Top-level fields tracked for the update-diff audit entry. */
const LEAD_AUDIT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'source',
  'estimatedValue',
  'status',
  'customFields',
];

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly customersService: CustomersService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly organizationsService: OrganizationsService,
    private readonly eventBus: CrmEventBus,
    private readonly auditService: AuditService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  /** Publish a lead domain event for the automation engine. */
  private emitLeadEvent(
    event: 'lead.created' | 'lead.status_changed' | 'lead.score_changed',
    lead: LeadDocument,
    context: Record<string, unknown> = {},
  ): void {
    this.eventBus.emit({
      event,
      recordType: 'lead',
      recordId: lead._id.toString(),
      record: lead.toObject() as unknown as Record<string, unknown>,
      context,
    });
  }

  // ── Capture & create ────────────────────────────────────────────────────

  async create(
    dto: CreateLeadDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<LeadResponseDto> {
    const email = dto.email.trim().toLowerCase();
    await this.assertNoOpenLeadWithEmail(email, organizationId);

    const assignment = await this.resolveAssignmentTargets(
      dto.assignedToId,
      dto.assignedTeamId,
    );
    const customFields = await this.customFieldsService.validateAndMerge(
      'lead',
      undefined,
      dto.customFields,
      organizationId,
    );

    const lead = await this.leadModel.create({
      organizationId,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      phone: dto.phone?.trim(),
      company: dto.company?.trim(),
      jobTitle: dto.jobTitle?.trim(),
      notes: dto.notes?.trim(),
      source: dto.source ?? 'manual',
      estimatedValue: dto.estimatedValue,
      createdBy,
      customFields,
      ...assignment,
    });

    this.logger.log(`Lead created (${lead.source}): ${email}`);
    this.emitLeadEvent('lead.created', lead);
    void this.auditService.log({
      organizationId,
      actor: { id: createdBy },
      action: 'create',
      entityType: 'lead',
      entityId: lead._id.toString(),
      entityLabel: `${lead.firstName} ${lead.lastName}`,
      summary: `Created lead "${lead.firstName} ${lead.lastName}"`,
      after: omitFields(lead.toObject(), ['engagements']),
    });
    return this.mapOne(lead);
  }

  /**
   * Unauthenticated ingestion from the public web form or an external API.
   * Repeat submissions with a known open-lead email are folded into the
   * existing lead as a `form_submitted` engagement instead of creating a
   * duplicate. Returns nothing — anonymous callers get no record data back.
   */
  async capture(dto: CaptureLeadDto): Promise<void> {
    // Honeypot tripped → pretend success, store nothing.
    if (dto.website?.trim()) {
      this.logger.warn(
        `Lead capture honeypot tripped for email ${dto.email} — submission discarded`,
      );
      return;
    }

    const organization = await this.organizationsService.findDocBySlug(
      dto.organizationSlug,
    );
    if (!organization) {
      // Don't reveal which slugs are valid to an anonymous caller.
      this.logger.warn(
        `Lead capture referenced unknown organizationSlug "${dto.organizationSlug}" — submission discarded`,
      );
      return;
    }
    const organizationId = organization._id;

    const email = dto.email.trim().toLowerCase();
    const source = dto.source ?? 'web_form';
    const engagement: LeadEngagement = {
      type: 'form_submitted',
      points: ENGAGEMENT_DEFAULT_POINTS.form_submitted,
      note: dto.message?.trim() || undefined,
      occurredAt: new Date(),
    };

    const existing = await this.leadModel
      .findOne({ organizationId, email, status: { $in: OPEN_LEAD_STATUSES } })
      .exec();

    if (existing) {
      existing.engagements.push(engagement);
      existing.score = computeScore(existing);
      // Fill gaps only — a public form must never overwrite rep-curated data
      if (!existing.phone && dto.phone) existing.phone = dto.phone.trim();
      if (!existing.company && dto.company)
        existing.company = dto.company.trim();
      await existing.save();
      this.logger.log(`Lead capture deduplicated into existing lead ${email}`);
      return;
    }

    // Territory auto-routing: match the submitted region tag to a team.
    let assignedTeamId: Types.ObjectId | undefined;
    if (dto.region?.trim()) {
      const { team } = await this.teamsService.matchRegion(
        dto.region,
        organizationId,
      );
      if (team) assignedTeamId = new Types.ObjectId(team.id);
    }

    const captured = await this.leadModel.create({
      organizationId,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      phone: dto.phone?.trim(),
      company: dto.company?.trim(),
      notes: dto.message?.trim(),
      source,
      createdBy: source === 'api' ? 'system:api' : 'system:web-form',
      engagements: [engagement],
      score: Math.max(0, Math.min(100, engagement.points)),
      ...(assignedTeamId ? { assignedTeamId } : {}),
    });
    this.emitLeadEvent('lead.created', captured);

    this.logger.log(
      `Lead captured via ${source}: ${email}${assignedTeamId ? ` (routed to team ${assignedTeamId.toString()})` : ''}`,
    );
  }

  // ── Read ────────────────────────────────────────────────────────────────

  private async buildListFilter(
    query: LeadQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { company: searchRegex },
          { phone: searchRegex },
        ],
      });
    }

    if (query.status) conditions.push({ status: query.status });
    if (query.source) conditions.push({ source: query.source });
    if (query.rating) conditions.push({ score: this.scoreRange(query.rating) });

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
    query: LeadQueryDto,
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

    const [items, total] = await Promise.all([
      this.leadModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.leadModel.countDocuments(filter).exec(),
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
  ): Promise<LeadStatsDto> {
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

    const [byStatus, total, hot, newThisMonth, convertedThisMonth, avg] =
      await Promise.all([
        this.leadModel
          .aggregate<{
            _id: string;
            count: number;
          }>([
            { $match: visibility },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .exec(),
        this.leadModel.countDocuments(visibility).exec(),
        this.leadModel
          .countDocuments({
            ...visibility,
            status: { $in: OPEN_LEAD_STATUSES },
            score: { $gte: LEAD_RATING_THRESHOLDS.hot },
          })
          .exec(),
        this.leadModel
          .countDocuments({ ...visibility, createdAt: { $gte: startOfMonth } })
          .exec(),
        this.leadModel
          .countDocuments({
            ...visibility,
            status: 'converted',
            convertedAt: { $gte: startOfMonth },
          })
          .exec(),
        this.leadModel
          .aggregate<{
            _id: null;
            avgScore: number;
          }>([
            { $match: { ...visibility, status: { $in: OPEN_LEAD_STATUSES } } },
            { $group: { _id: null, avgScore: { $avg: '$score' } } },
          ])
          .exec(),
      ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const converted = counts['converted'] ?? 0;

    return {
      total,
      new: counts['new'] ?? 0,
      contacted: counts['contacted'] ?? 0,
      qualified: counts['qualified'] ?? 0,
      unqualified: counts['unqualified'] ?? 0,
      converted,
      hot,
      newThisMonth,
      convertedThisMonth,
      conversionRate: total === 0 ? 0 : Math.round((converted / total) * 100),
      averageScore: Math.round(avg[0]?.avgScore ?? 0),
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<LeadResponseDto> {
    const lead = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(lead, requesterKeycloakId, organizationId);
    return this.mapOne(lead);
  }

  // ── Update, qualification & routing ─────────────────────────────────────

  async update(
    id: string,
    dto: UpdateLeadDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<LeadResponseDto> {
    const lead = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(lead, requesterKeycloakId, organizationId);
    this.assertNotConverted(lead);

    const previousStatus = lead.status;
    const before = lead.toObject();

    if (dto.email !== undefined) {
      const newEmail = dto.email.trim().toLowerCase();
      if (newEmail !== lead.email) {
        await this.assertNoOpenLeadWithEmail(
          newEmail,
          organizationId,
          lead._id,
        );
        lead.email = newEmail;
      }
    }

    if (dto.firstName !== undefined) lead.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) lead.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) lead.phone = dto.phone.trim();
    if (dto.company !== undefined) lead.company = dto.company.trim();
    if (dto.jobTitle !== undefined) lead.jobTitle = dto.jobTitle.trim();
    if (dto.notes !== undefined) lead.notes = dto.notes.trim();
    if (dto.source !== undefined) lead.source = dto.source;
    if (dto.estimatedValue !== undefined)
      lead.estimatedValue = dto.estimatedValue;
    if (dto.status !== undefined) lead.status = dto.status;
    if (dto.customFields !== undefined) {
      lead.customFields = await this.customFieldsService.validateAndMerge(
        'lead',
        lead.customFields,
        dto.customFields,
        organizationId,
      );
    }

    await lead.save();
    this.logger.log(`Lead updated: ${id} (status=${lead.status})`);
    if (lead.status !== previousStatus) {
      this.emitLeadEvent('lead.status_changed', lead, {
        previousStatus,
        newStatus: lead.status,
      });
    }
    const changes = diffFields(before, lead.toObject(), LEAD_AUDIT_FIELDS);
    if (changes.length > 0) {
      void this.auditService.log({
        organizationId,
        actor: { id: requesterKeycloakId },
        action: changes.some((c) => c.field === 'status')
          ? 'status_change'
          : 'update',
        entityType: 'lead',
        entityId: id,
        entityLabel: `${lead.firstName} ${lead.lastName}`,
        summary: `Updated lead "${lead.firstName} ${lead.lastName}" (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    }
    return this.mapOne(lead);
  }

  /**
   * Log an engagement touchpoint and recompute the score. A successful
   * two-way contact (call, meeting, email reply) automatically moves a
   * `new` lead to `contacted`.
   */
  async addEngagement(
    id: string,
    dto: AddEngagementDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<LeadResponseDto> {
    const lead = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(lead, requesterKeycloakId, organizationId);
    this.assertNotConverted(lead);

    const previousScore = lead.score;
    const previousStatus = lead.status;

    lead.engagements.push({
      type: dto.type,
      points: dto.points ?? ENGAGEMENT_DEFAULT_POINTS[dto.type],
      note: dto.note?.trim() || undefined,
      recordedBy: requesterKeycloakId,
      occurredAt: new Date(),
    });
    lead.score = computeScore(lead);

    if (lead.status === 'new' && CONTACT_ENGAGEMENTS.includes(dto.type)) {
      lead.status = 'contacted';
    }

    await lead.save();
    this.logger.log(
      `Engagement ${dto.type} logged on lead ${id} (score=${lead.score})`,
    );
    if (lead.score !== previousScore) {
      this.emitLeadEvent('lead.score_changed', lead, {
        previousScore,
        newScore: lead.score,
      });
    }
    if (lead.status !== previousStatus) {
      this.emitLeadEvent('lead.status_changed', lead, {
        previousStatus,
        newStatus: lead.status,
      });
    }
    return this.mapOne(lead);
  }

  /**
   * Record routing: set or clear the record owner and/or the assigned team.
   * Omitted fields are unchanged; null clears a field.
   */
  async assign(
    id: string,
    dto: AssignLeadDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<LeadResponseDto> {
    const lead = await this.getByIdOrFail(id, organizationId);
    this.assertNotConverted(lead);

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
      return this.mapOne(lead);
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    const finalOwner =
      dto.assignedToId === undefined
        ? (lead.assignedToId ?? null)
        : dto.assignedToId;
    const finalTeam =
      targetTeam !== undefined
        ? targetTeam
        : lead.assignedTeamId
          ? await this.teamsService.findDocById(lead.assignedTeamId.toString())
          : null;

    if (finalOwner && finalTeam && !finalTeam.memberIds.includes(finalOwner)) {
      throw new BadRequestException(
        'Record owner must be a member of the assigned team',
      );
    }

    const updated = await this.leadModel
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
      `Lead ${id} routed: owner=${updated.assignedToId ?? 'none'}, team=${updated.assignedTeamId?.toString() ?? 'none'}`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'assign',
      entityType: 'lead',
      entityId: id,
      entityLabel: `${updated.firstName} ${updated.lastName}`,
      summary: `Reassigned lead "${updated.firstName} ${updated.lastName}"`,
      changes: diffFields(lead.toObject(), updated.toObject(), [
        'assignedToId',
        'assignedTeamId',
      ]),
    });
    return this.mapOne(updated);
  }

  // ── Conversion ──────────────────────────────────────────────────────────

  /**
   * Convert a qualified lead into a Customer and (by default) an
   * Opportunity. Multi-store write in the established order-with-rollback
   * discipline: customer (Keycloak + Mongo, handled by CustomersService) →
   * opportunity → lead flags; on failure roll back in reverse.
   */
  async convert(
    id: string,
    dto: ConvertLeadDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<LeadResponseDto> {
    const lead = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(lead, requesterKeycloakId, organizationId);
    this.assertNotConverted(lead);

    if (lead.status !== 'qualified') {
      throw new BadRequestException(
        'Only qualified leads can be converted. Qualify the lead first.',
      );
    }

    const phone = dto.phone?.trim() || lead.phone;
    if (!phone) {
      throw new BadRequestException(
        'A phone number is required to create the customer profile',
      );
    }

    // 1. Customer (CustomersService owns the Keycloak+Mongo write & rollback)
    const customer = await this.customersService.create(
      {
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone,
        company: lead.company,
        address: dto.address,
        notes: lead.notes,
        status: 'prospect',
        assignedToId: lead.assignedToId,
        assignedTeamId: lead.assignedTeamId?.toString(),
      },
      requesterKeycloakId,
      organizationId,
    );

    // 2. Opportunity (optional)
    let opportunityId: string | null = null;
    const createOpportunity = dto.createOpportunity ?? true;

    try {
      if (createOpportunity) {
        const opportunity = await this.opportunitiesService.create(
          {
            name:
              dto.opportunityName?.trim() ||
              `${lead.company || `${lead.firstName} ${lead.lastName}`} deal`,
            customerId: customer.id,
            amount: dto.amount ?? lead.estimatedValue ?? 0,
            stage: dto.stage ?? 'discovery',
            expectedCloseDate: dto.expectedCloseDate,
            assignedToId: lead.assignedToId,
            assignedTeamId: lead.assignedTeamId?.toString(),
            leadId: lead._id.toString(),
          },
          requesterKeycloakId,
          organizationId,
        );
        opportunityId = opportunity.id;
      }

      // 3. Flag the lead as converted
      lead.status = 'converted';
      lead.convertedCustomerId = new Types.ObjectId(customer.id);
      lead.convertedOpportunityId = opportunityId
        ? new Types.ObjectId(opportunityId)
        : undefined;
      lead.convertedAt = new Date();
      lead.convertedBy = requesterKeycloakId;
      await lead.save();

      this.logger.log(
        `Lead ${id} converted → customer ${customer.id}${opportunityId ? `, opportunity ${opportunityId}` : ''}`,
      );
      this.emitLeadEvent('lead.status_changed', lead, {
        previousStatus: 'qualified',
        newStatus: 'converted',
      });
      void this.auditService.log({
        organizationId,
        actor: { id: requesterKeycloakId },
        action: 'convert',
        entityType: 'lead',
        entityId: id,
        entityLabel: `${lead.firstName} ${lead.lastName}`,
        summary: `Converted lead "${lead.firstName} ${lead.lastName}" → customer${opportunityId ? ' + opportunity' : ''}`,
        metadata: { customerId: customer.id, opportunityId },
      });
      return this.mapOne(lead);
    } catch (error) {
      this.logger.error(
        `Lead conversion failed after customer creation. Rolling back for lead ${id}`,
        error,
      );

      if (opportunityId) {
        try {
          await this.opportunitiesService.remove(
            opportunityId,
            { id: requesterKeycloakId },
            organizationId,
          );
        } catch (oppError) {
          this.logger.error(
            `Rollback failure: could not delete opportunity ${opportunityId}:`,
            oppError,
          );
        }
      }
      try {
        // Removes the Keycloak account and both Mongo documents
        await this.customersService.remove(
          customer.id,
          { id: requesterKeycloakId },
          organizationId,
        );
      } catch (custError) {
        this.logger.error(
          `Rollback critical failure: could not delete customer ${customer.id}:`,
          custError,
        );
      }

      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to convert lead.');
    }
  }

  async remove(
    id: string,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const lead = await this.getByIdOrFail(id, organizationId);
    await this.leadModel.deleteOne({ _id: lead._id }).exec();
    this.logger.log(`Lead deleted: ${id}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'lead',
      entityId: id,
      entityLabel: `${lead.firstName} ${lead.lastName}`,
      summary: `Deleted lead "${lead.firstName} ${lead.lastName}"`,
      before: omitFields(lead.toObject(), ['engagements']),
    });
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
    lead: LeadDocument,
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
    if (lead.assignedToId === keycloakId || lead.createdBy === keycloakId) {
      return;
    }
    if (lead.assignedTeamId) {
      const teamIds = await this.teamsService.getTeamIdsForMember(
        keycloakId,
        organizationId,
      );
      if (teamIds.some((teamId) => teamId.equals(lead.assignedTeamId))) {
        return;
      }
    }
    throw new NotFoundException(
      `Lead with ID ${lead._id.toString()} not found`,
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private assertNotConverted(lead: LeadDocument): void {
    if (lead.status === 'converted') {
      throw new BadRequestException(
        'This lead has been converted and is read-only',
      );
    }
  }

  private async assertNoOpenLeadWithEmail(
    email: string,
    organizationId: Types.ObjectId,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const existing = await this.leadModel
      .findOne({
        organizationId,
        email,
        status: { $in: OPEN_LEAD_STATUSES },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .exec();
    if (existing) {
      throw new ConflictException(
        'An open lead with this email already exists',
      );
    }
  }

  private scoreRange(rating: 'hot' | 'warm' | 'cold'): Record<string, number> {
    if (rating === 'hot') return { $gte: LEAD_RATING_THRESHOLDS.hot };
    if (rating === 'warm')
      return {
        $gte: LEAD_RATING_THRESHOLDS.warm,
        $lt: LEAD_RATING_THRESHOLDS.hot,
      };
    return { $lt: LEAD_RATING_THRESHOLDS.warm };
  }

  /** Validate optional routing targets on lead creation. */
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

  private async mapOne(lead: LeadDocument): Promise<LeadResponseDto> {
    const [dto] = await this.mapMany([lead]);
    return dto;
  }

  /** Batch-denormalize staff/team names into responses (one lookup per collection per page). */
  private async mapMany(leads: LeadDocument[]): Promise<LeadResponseDto[]> {
    if (leads.length === 0) return [];

    const staffIds = [
      ...new Set(
        leads
          .flatMap((l) => [
            l.assignedToId,
            ...l.engagements.map((e) => e.recordedBy),
          ])
          .filter((v): v is string => !!v),
      ),
    ];
    const teamIds = [
      ...new Set(
        leads
          .map((l) => l.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];

    const [staff, teamNames] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(staffIds),
      this.teamsService.findNamesByIds(teamIds),
    ]);

    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return leads.map((l) => toLeadResponseDto(l, { staffNames, teamNames }));
  }

  /** Load a lead by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<LeadDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }
    const lead = await this.leadModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }
    return lead;
  }

  // ── Import / export ─────────────────────────────────────────────────────

  async exportCsv(
    query: LeadQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<string> {
    const filter = await this.buildListFilter(
      query,
      requesterKeycloakId,
      organizationId,
    );
    const leads = await this.leadModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(EXPORT_ROW_LIMIT)
      .exec();

    const header = [
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Company',
      'Job Title',
      'Source',
      'Status',
      'Score',
      'Estimated Value',
      'Notes',
      'Created At',
    ];
    const rows = leads.map((l) => [
      l.firstName,
      l.lastName,
      l.email,
      l.phone ?? '',
      l.company ?? '',
      l.jobTitle ?? '',
      l.source,
      l.status,
      l.score,
      l.estimatedValue ?? '',
      l.notes ?? '',
      l.createdAt?.toISOString() ?? '',
    ]);
    return toCsv(header, rows);
  }

  async importCsv(
    fileBuffer: Buffer,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<ImportResultDto> {
    const { records } = parseCsvToRecords(fileBuffer.toString('utf-8'));
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `CSV exceeds the ${MAX_IMPORT_ROWS}-row import limit`,
      );
    }

    return runImport(records, async (record) => {
      const dto = plainToInstance(CreateLeadDto, {
        firstName: record.firstname || record['first name'],
        lastName: record.lastname || record['last name'],
        email: record.email,
        phone: record.phone || undefined,
        company: record.company || undefined,
        jobTitle: record.jobtitle || record['job title'] || undefined,
        notes: record.notes || undefined,
        source: record.source || undefined,
        estimatedValue: record.estimatedvalue
          ? Number(record.estimatedvalue)
          : record['estimated value']
            ? Number(record['estimated value'])
            : undefined,
      });
      const validationErrors = await validate(dto, { whitelist: true });
      if (validationErrors.length > 0) {
        throw new BadRequestException(
          validationErrors
            .map((e) => Object.values(e.constraints ?? {}).join('; '))
            .join('; '),
        );
      }
      await this.create(dto, createdBy, organizationId);
    });
  }
}
