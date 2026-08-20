import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditActor,
  AuditService,
  diffFields,
  omitFields,
} from '../audit/audit.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomersService } from '../customers/customers.service';
import { CrmEventBus } from '../events/crm-event-bus.service';
import { toCsv } from '../import-export/csv.util';
import { KbService } from '../kb/kb.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { FieldRestrictionInfo } from '../roles/permissions.service';
import { PermissionsService } from '../roles/permissions.service';
import { TeamDocument } from '../teams/team.schema';
import { TeamsService } from '../teams/teams.service';
import { UsersService } from '../users/users.service';
import {
  AddMyTicketCommentDto,
  AddTicketCommentDto,
} from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateMyTicketDto, CreateTicketDto } from './dto/create-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { TicketResponseDto, TicketStatsDto } from './dto/ticket-response.dto';
import { SetTicketStatusDto } from './dto/ticket-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { toTicketResponseDto } from './mappers/ticket.mapper';
import {
  ACTIVE_TICKET_STATUSES,
  Ticket,
  TicketCounter,
  TicketCounterDocument,
  TicketDocument,
  TicketStatus,
} from './ticket.schema';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cap CSV exports at a sane row count to keep the response fast and memory-bounded. */
const EXPORT_ROW_LIMIT = 5000;

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(TicketCounter.name)
    private readonly counterModel: Model<TicketCounterDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly customersService: CustomersService,
    private readonly kbService: KbService,
    private readonly eventBus: CrmEventBus,
    private readonly auditService: AuditService,
    private readonly customFieldsService: CustomFieldsService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ── Staff: create / read ────────────────────────────────────────────────

  async create(
    dto: CreateTicketDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<TicketResponseDto> {
    await this.permissionsService.requirePermission(
      createdBy,
      organizationId,
      'ticket',
      'create',
    );
    const customer = await this.customersService.findDocById(
      dto.customerId,
      organizationId,
    );
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const assignment = await this.resolveAssignmentTargets(
      organizationId,
      dto.assignedToId,
      dto.assignedTeamId,
    );
    const customFields = await this.customFieldsService.validateAndMerge(
      'ticket',
      undefined,
      dto.customFields,
      organizationId,
    );

    const ticket = await this.ticketModel.create({
      organizationId,
      number: await this.nextTicketNumber(),
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      type: dto.type ?? 'question',
      priority: dto.priority ?? 'normal',
      customerId: customer._id,
      createdBy,
      customFields,
      ...assignment,
    });

    this.logger.log(`Ticket created: ${ticket.number} "${ticket.subject}"`);
    this.emitTicketEvent('ticket.created', ticket);
    void this.auditService.log({
      organizationId,
      actor: { id: createdBy },
      action: 'create',
      entityType: 'ticket',
      entityId: ticket._id.toString(),
      entityLabel: `${ticket.number} ${ticket.subject}`,
      summary: `Created ticket ${ticket.number} "${ticket.subject}"`,
      after: omitFields(ticket.toObject(), ['comments']),
    });
    return this.mapOne(ticket);
  }

  private async buildListFilter(
    query: TicketQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = [{ organizationId }];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { number: searchRegex },
          { subject: searchRegex },
          { description: searchRegex },
        ],
      });
    }
    if (query.status) conditions.push({ status: query.status });
    if (query.openOnly === 'true')
      conditions.push({ status: { $ne: 'closed' } });
    if (query.type) conditions.push({ type: query.type });
    if (query.priority) conditions.push({ priority: query.priority });
    if (query.customerId)
      conditions.push({ customerId: new Types.ObjectId(query.customerId) });
    if (query.assignedToId)
      conditions.push({ assignedToId: query.assignedToId });
    if (query.unassigned === 'true')
      conditions.push({ assignedToId: { $exists: false } });

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
    query: TicketQueryDto,
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

    const sortBy = query.sortBy ?? 'updatedAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    // Secondary _id sort keeps pagination stable when the primary key has ties
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total, fieldRestrictions] = await Promise.all([
      this.ticketModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.ticketModel.countDocuments(filter).exec(),
      this.getFieldRestrictions(requesterKeycloakId, organizationId),
    ]);

    return {
      data: await this.mapMany(items, { fieldRestrictions }),
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
  ): Promise<TicketStatsDto> {
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

    const [
      byStatus,
      unassigned,
      urgent,
      awaitingFirstResponse,
      resolvedThisMonth,
      responseAgg,
    ] = await Promise.all([
      this.ticketModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          { $match: visibility },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.ticketModel
        .countDocuments({
          ...visibility,
          status: { $ne: 'closed' },
          assignedToId: { $exists: false },
        })
        .exec(),
      this.ticketModel
        .countDocuments({
          ...visibility,
          status: { $in: ACTIVE_TICKET_STATUSES },
          priority: 'urgent',
        })
        .exec(),
      this.ticketModel
        .countDocuments({
          ...visibility,
          status: { $in: ACTIVE_TICKET_STATUSES },
          firstResponseAt: { $exists: false },
        })
        .exec(),
      this.ticketModel
        .countDocuments({
          ...visibility,
          resolvedAt: { $gte: startOfMonth },
        })
        .exec(),
      this.ticketModel
        .aggregate<{ _id: null; avgMs: number }>([
          {
            $match: {
              ...visibility,
              firstResponseAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              avgMs: {
                $avg: { $subtract: ['$firstResponseAt', '$createdAt'] },
              },
            },
          },
        ])
        .exec(),
    ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const avgMs = responseAgg[0]?.avgMs;

    return {
      open: counts['open'] ?? 0,
      inProgress: counts['in_progress'] ?? 0,
      waitingOnCustomer: counts['waiting_on_customer'] ?? 0,
      unassigned,
      urgent,
      awaitingFirstResponse,
      resolvedThisMonth,
      avgFirstResponseHours:
        avgMs === undefined || avgMs === null
          ? null
          : Math.round((avgMs / 36e5) * 10) / 10,
    };
  }

  async findOne(
    id: string,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<TicketResponseDto> {
    const ticket = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(ticket, requesterKeycloakId, organizationId);
    const fieldRestrictions = await this.getFieldRestrictions(
      requesterKeycloakId,
      organizationId,
    );
    return this.mapOne(ticket, { fieldRestrictions });
  }

  // ── Staff: update / status / comments / routing / delete ───────────────

  async update(
    id: string,
    dto: UpdateTicketDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<TicketResponseDto> {
    const { fieldRestrictions } =
      await this.permissionsService.requirePermission(
        requesterKeycloakId,
        organizationId,
        'ticket',
        'update',
      );
    const ticket = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(ticket, requesterKeycloakId, organizationId);

    if (dto.subject !== undefined) ticket.subject = dto.subject.trim();
    if (dto.description !== undefined)
      ticket.description = dto.description.trim();
    if (dto.type !== undefined) ticket.type = dto.type;
    if (dto.priority !== undefined) ticket.priority = dto.priority;

    if (dto.relatedArticleIds !== undefined) {
      for (const articleId of dto.relatedArticleIds) {
        if (!(await this.kbService.existsById(articleId, organizationId))) {
          throw new BadRequestException(
            `Linked article ${articleId} not found`,
          );
        }
      }
      ticket.relatedArticleIds = dto.relatedArticleIds.map(
        (a) => new Types.ObjectId(a),
      );
    }

    if (dto.customFields !== undefined) {
      const sanitized = this.permissionsService.stripReadonlyFieldChanges(
        ticket.customFields,
        dto.customFields,
        fieldRestrictions,
      );
      ticket.customFields = await this.customFieldsService.validateAndMerge(
        'ticket',
        ticket.customFields,
        sanitized,
        organizationId,
      );
    }

    await ticket.save();
    this.logger.log(`Ticket updated: ${ticket.number}`);
    return this.mapOne(ticket);
  }

  /** Status workflow; stamps resolved/closed timestamps and emits events. */
  async setStatus(
    id: string,
    dto: SetTicketStatusDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<TicketResponseDto> {
    await this.permissionsService.requirePermission(
      requesterKeycloakId,
      organizationId,
      'ticket',
      'update',
    );
    const ticket = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(ticket, requesterKeycloakId, organizationId);
    if (ticket.status === dto.status) return this.mapOne(ticket);

    const previousStatus = ticket.status;
    this.applyStatus(ticket, dto.status);
    await ticket.save();

    this.logger.log(`Ticket ${ticket.number} status → ${dto.status}`);
    void this.auditService.log({
      organizationId,
      actor: { id: requesterKeycloakId },
      action: 'status_change',
      entityType: 'ticket',
      entityId: id,
      entityLabel: `${ticket.number} ${ticket.subject}`,
      summary: `Ticket ${ticket.number} status: ${previousStatus} → ${dto.status}`,
      changes: [{ field: 'status', from: previousStatus, to: dto.status }],
    });
    return this.mapOne(ticket);
  }

  /** Staff comment. First public reply stamps the first-response time. */
  async addComment(
    id: string,
    dto: AddTicketCommentDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<TicketResponseDto> {
    await this.permissionsService.requirePermission(
      requesterKeycloakId,
      organizationId,
      'ticket',
      'update',
    );
    const ticket = await this.getByIdOrFail(id, organizationId);
    await this.assertCanView(ticket, requesterKeycloakId, organizationId);
    if (ticket.status === 'closed') {
      throw new BadRequestException(
        'This ticket is closed — reopen it to continue the conversation',
      );
    }

    const isInternal = dto.isInternal ?? false;
    ticket.comments.push({
      authorId: requesterKeycloakId,
      authorRole: 'staff',
      body: dto.body.trim(),
      isInternal,
      postedAt: new Date(),
    });

    if (!isInternal) {
      if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
      // A public staff reply on a fresh ticket means work has started
      if (ticket.status === 'open') this.applyStatus(ticket, 'in_progress');
    }

    await ticket.save();
    void this.notificationsService.notify({
      organizationId,
      recipientId: ticket.assignedToId,
      actorId: requesterKeycloakId,
      type: 'comment',
      title: `New comment on ${ticket.number}`,
      body: dto.body.trim().slice(0, 200),
      entityType: 'ticket',
      entityId: ticket._id,
    });
    return this.mapOne(ticket);
  }

  /**
   * Record routing: set or clear the ticket owner and/or the assigned team.
   * Omitted fields are unchanged; null clears a field.
   */
  async assign(
    id: string,
    dto: AssignTicketDto,
    actor: AuditActor,
    organizationId: Types.ObjectId,
  ): Promise<TicketResponseDto> {
    await this.permissionsService.requirePermission(
      actor.id ?? '',
      organizationId,
      'ticket',
      'update',
    );
    const ticket = await this.getByIdOrFail(id, organizationId);

    const sets: Record<string, unknown> = {};
    const unsets: Record<string, ''> = {};
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
      return this.mapOne(ticket);
    }

    // Consistency rule: when the record ends up with both an owner and a
    // team, the owner must be a member of that team.
    const finalOwner =
      dto.assignedToId === undefined
        ? (ticket.assignedToId ?? null)
        : dto.assignedToId;
    const finalTeam =
      targetTeam !== undefined
        ? targetTeam
        : ticket.assignedTeamId
          ? await this.teamsService.findDocById(
              ticket.assignedTeamId.toString(),
              organizationId,
            )
          : null;

    if (finalOwner && finalTeam && !finalTeam.memberIds.includes(finalOwner)) {
      throw new BadRequestException(
        'Ticket owner must be a member of the assigned team',
      );
    }

    const updated = await this.ticketModel
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
      `Ticket ${updated.number} routed: owner=${updated.assignedToId ?? 'none'}, team=${updated.assignedTeamId?.toString() ?? 'none'}`,
    );
    void this.auditService.log({
      organizationId,
      actor,
      action: 'assign',
      entityType: 'ticket',
      entityId: id,
      entityLabel: `${updated.number} ${updated.subject}`,
      summary: `Reassigned ticket ${updated.number} "${updated.subject}"`,
      changes: diffFields(ticket.toObject(), updated.toObject(), [
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
        title: 'Ticket assigned to you',
        body: `${updated.number} — ${updated.subject}`,
        entityType: 'ticket',
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
      'ticket',
      'delete',
    );
    const ticket = await this.getByIdOrFail(id, organizationId);
    await this.ticketModel.deleteOne({ _id: ticket._id }).exec();
    this.logger.log(`Ticket deleted: ${ticket.number}`);
    void this.auditService.log({
      organizationId,
      actor,
      action: 'delete',
      entityType: 'ticket',
      entityId: id,
      entityLabel: `${ticket.number} ${ticket.subject}`,
      summary: `Deleted ticket ${ticket.number} "${ticket.subject}"`,
      before: omitFields(ticket.toObject(), ['comments']),
    });
  }

  // ── Customer portal (AppRole.Customer) ──────────────────────────────────

  /** Portal customer raises a ticket for themselves. */
  async createMy(
    dto: CreateMyTicketDto,
    customerKeycloakId: string,
  ): Promise<TicketResponseDto> {
    const customer = await this.getPortalCustomerOrFail(customerKeycloakId);

    const ticket = await this.ticketModel.create({
      organizationId: customer.organizationId,
      number: await this.nextTicketNumber(),
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      type: dto.type ?? 'question',
      priority: 'normal',
      customerId: customer._id,
      createdBy: customerKeycloakId,
      // Inherit the customer's routing so the right team sees it at once
      ...(customer.assignedToId ? { assignedToId: customer.assignedToId } : {}),
      ...(customer.assignedTeamId
        ? { assignedTeamId: customer.assignedTeamId }
        : {}),
    });

    this.logger.log(
      `Ticket ${ticket.number} raised via portal by ${customer.email}`,
    );
    this.emitTicketEvent('ticket.created', ticket);
    return this.mapOne(ticket, { forCustomer: true });
  }

  /** The signed-in customer's own tickets (internal notes stripped). */
  async findMy(customerKeycloakId: string): Promise<TicketResponseDto[]> {
    const customer = await this.getPortalCustomerOrFail(customerKeycloakId);
    const tickets = await this.ticketModel
      .find({
        organizationId: customer.organizationId,
        customerId: customer._id,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .exec();
    return this.mapMany(tickets, { forCustomer: true });
  }

  async findMyOne(
    id: string,
    customerKeycloakId: string,
  ): Promise<TicketResponseDto> {
    const { ticket } = await this.getOwnTicketOrFail(id, customerKeycloakId);
    return this.mapOne(ticket, { forCustomer: true });
  }

  /**
   * Customer reply. Waiting-on-customer flips back to in-progress; a reply
   * on a resolved ticket reopens it. Closed tickets are immutable.
   */
  async addMyComment(
    id: string,
    dto: AddMyTicketCommentDto,
    customerKeycloakId: string,
  ): Promise<TicketResponseDto> {
    const { ticket } = await this.getOwnTicketOrFail(id, customerKeycloakId);
    if (ticket.status === 'closed') {
      throw new BadRequestException(
        'This ticket is closed — please open a new ticket',
      );
    }

    ticket.comments.push({
      authorId: customerKeycloakId,
      authorRole: 'customer',
      body: dto.body.trim(),
      isInternal: false,
      postedAt: new Date(),
    });

    if (ticket.status === 'waiting_on_customer') {
      this.applyStatus(ticket, 'in_progress');
    } else if (ticket.status === 'resolved') {
      this.applyStatus(ticket, 'open'); // not fixed after all
    }

    await ticket.save();
    void this.notificationsService.notify({
      organizationId: ticket.organizationId,
      recipientId: ticket.assignedToId,
      actorId: customerKeycloakId,
      type: 'comment',
      title: `New customer reply on ${ticket.number}`,
      body: dto.body.trim().slice(0, 200),
      entityType: 'ticket',
      entityId: ticket._id,
    });
    return this.mapOne(ticket, { forCustomer: true });
  }

  // ── Status helper (single place for stamps + events) ───────────────────

  private applyStatus(ticket: TicketDocument, status: TicketStatus): void {
    const previousStatus = ticket.status;
    ticket.status = status;

    if (status === 'resolved') {
      ticket.resolvedAt = new Date();
    } else if (status === 'closed') {
      ticket.closedAt = ticket.closedAt ?? new Date();
    } else {
      ticket.resolvedAt = status === 'open' ? undefined : ticket.resolvedAt;
      ticket.closedAt = undefined;
    }

    this.emitTicketEvent('ticket.status_changed', ticket, {
      previousStatus,
      newStatus: status,
    });
  }

  private emitTicketEvent(
    event: 'ticket.created' | 'ticket.status_changed',
    ticket: TicketDocument,
    context: Record<string, unknown> = {},
  ): void {
    this.eventBus.emit({
      event,
      recordType: 'ticket',
      recordId: ticket._id.toString(),
      record: ticket.toObject() as unknown as Record<string, unknown>,
      context,
    });
  }

  // ── Row-level visibility (staff; same model as CustomersService) ───────

  private async buildVisibilityFilter(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    const { scope } = await this.permissionsService.requirePermission(
      keycloakId,
      organizationId,
      'ticket',
      'read',
    );
    if (scope === 'all') return null;
    const teamIds = await this.teamsService.getTeamIdsForMember(
      keycloakId,
      organizationId,
    );
    const base = this.permissionsService.buildVisibilityFilter(
      scope,
      keycloakId,
      teamIds,
    ) as { $or: Record<string, unknown>[] };
    return {
      // Support triage: unowned tickets are visible to all staff regardless
      // of scope — this is a workflow exception, not a security boundary.
      $or: [...base.$or, { assignedToId: { $exists: false } }],
    };
  }

  /** 404 (not 403) outside the caller's scope, to avoid leaking existence. */
  private async assertCanView(
    ticket: TicketDocument,
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const { scope } = await this.permissionsService.requirePermission(
      keycloakId,
      organizationId,
      'ticket',
      'read',
    );
    if (!ticket.assignedToId) return; // unowned = triage queue, visible to all staff
    const inScope = await this.permissionsService.isRecordInScope(
      scope,
      keycloakId,
      organizationId,
      ticket,
    );
    if (!inScope) {
      throw new NotFoundException(
        `Ticket with ID ${ticket._id.toString()} not found`,
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
        'ticket',
        'read',
      );
    return fieldRestrictions;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Atomic counter → TKT-1001, TKT-1002, … */
  private async nextTicketNumber(): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'ticket' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .exec();
    return `TKT-${counter.seq}`;
  }

  private async getPortalCustomerOrFail(keycloakId: string) {
    const customer =
      await this.customersService.findDocByKeycloakId(keycloakId);
    if (!customer) {
      throw new ForbiddenException(
        'No customer profile is linked to this account',
      );
    }
    return customer;
  }

  private async getOwnTicketOrFail(id: string, customerKeycloakId: string) {
    const customer = await this.getPortalCustomerOrFail(customerKeycloakId);
    const ticket = await this.getByIdOrFail(id, customer.organizationId);
    if (!ticket.customerId.equals(customer._id)) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    return { ticket, customer };
  }

  /** Validate optional routing targets on staff ticket creation. */
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
          'Ticket owner must be a member of the assigned team',
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
        'Ticket owner must be an existing staff user',
      );
    }
  }

  // ── Mapping ─────────────────────────────────────────────────────────────

  private async mapOne(
    ticket: TicketDocument,
    options: {
      forCustomer?: boolean;
      fieldRestrictions?: Map<string, FieldRestrictionInfo>;
    } = {},
  ): Promise<TicketResponseDto> {
    const [dto] = await this.mapMany([ticket], options);
    return dto;
  }

  /** Batch-denormalize names + article titles; strips internal notes for customers. */
  private async mapMany(
    tickets: TicketDocument[],
    options: {
      forCustomer?: boolean;
      fieldRestrictions?: Map<string, FieldRestrictionInfo>;
    } = {},
  ): Promise<TicketResponseDto[]> {
    if (tickets.length === 0) return [];
    // Every document in a mapping batch came from one org-scoped query, so
    // deriving the tenant from the batch itself cannot pick the wrong org.
    const organizationId = tickets[0].organizationId;

    const staffIds = [
      ...new Set(
        tickets
          .flatMap((t) => [
            t.assignedToId,
            ...t.comments
              .filter((c) => c.authorRole === 'staff')
              .map((c) => c.authorId),
          ])
          .filter((v): v is string => !!v),
      ),
    ];
    const teamIds = [
      ...new Set(
        tickets
          .map((t) => t.assignedTeamId?.toString())
          .filter((v): v is string => !!v),
      ),
    ];
    const customerIds = [
      ...new Set(tickets.map((t) => t.customerId.toString())),
    ];
    const articleIds = [
      ...new Set(
        tickets.flatMap((t) => t.relatedArticleIds.map((a) => a.toString())),
      ),
    ];

    const [staff, teamNames, customerNames, articleTitles] = await Promise.all([
      this.usersService.findStaffByKeycloakIds(staffIds, organizationId),
      this.teamsService.findNamesByIds(teamIds, organizationId),
      this.customersService.findNamesByIds(customerIds, organizationId),
      this.kbService.findTitlesByIds(articleIds, organizationId),
    ]);

    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return tickets.map((t) => {
      const dto = toTicketResponseDto(t, {
        staffNames,
        teamNames,
        customerNames,
        articleTitles,
        forCustomer: options.forCustomer ?? false,
      });
      if (options.fieldRestrictions) {
        dto.customFields =
          this.permissionsService.applyFieldVisibility(
            dto.customFields,
            options.fieldRestrictions,
          ) ?? {};
      }
      return dto;
    });
  }

  /** Load a ticket by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<TicketDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    const ticket = await this.ticketModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    return ticket;
  }

  // ── Export ───────────────────────────────────────────────────────────────

  async exportCsv(
    query: TicketQueryDto,
    requesterKeycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<string> {
    const filter = await this.buildListFilter(
      query,
      requesterKeycloakId,
      organizationId,
    );
    const tickets = await this.ticketModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(EXPORT_ROW_LIMIT)
      .exec();

    const header = [
      'Number',
      'Subject',
      'Type',
      'Status',
      'Priority',
      'Resolved At',
      'Closed At',
      'Created At',
    ];
    const rows = tickets.map((t) => [
      t.number,
      t.subject,
      t.type,
      t.status,
      t.priority,
      t.resolvedAt?.toISOString() ?? '',
      t.closedAt?.toISOString() ?? '',
      t.createdAt?.toISOString() ?? '',
    ]);
    return toCsv(header, rows);
  }
}
