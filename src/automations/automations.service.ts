import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ActivitiesService } from '../activities/activities.service';
import { ContactsService } from '../contacts/contacts.service';
import { CustomersService } from '../customers/customers.service';
import {
  CRM_EVENTS,
  CrmEventBus,
  CrmEventPayload,
} from '../events/crm-event-bus.service';
import { Lead, LeadDocument, OPEN_LEAD_STATUSES } from '../leads/lead.schema';
import { LeadsService } from '../leads/leads.service';
import { MailService } from '../mail/mail.service';
import {
  Opportunity,
  OPPORTUNITY_STAGES_OPEN,
  OpportunityDocument,
} from '../opportunities/opportunity.schema';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { TeamsService } from '../teams/teams.service';
import {
  ACTIVE_TICKET_STATUSES,
  Ticket,
  TicketDocument,
} from '../tickets/ticket.schema';
import { UsersService } from '../users/users.service';
import {
  AutomationRule,
  AutomationRuleDocument,
  RuleAction,
  RuleCondition,
  SlaEntity,
} from './automation-rule.schema';
import {
  AutomationRun,
  AutomationRunDocument,
  RunStatus,
} from './automation-run.schema';
import { RuleQueryDto, RunQueryDto } from './dto/automation-query.dto';
import {
  AutomationRuleResponseDto,
  AutomationRunResponseDto,
  AutomationStatsDto,
} from './dto/automation-response.dto';
import {
  CreateAutomationRuleDto,
  RuleActionDto,
} from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import {
  toRuleResponseDto,
  toRunResponseDto,
} from './mappers/automation.mapper';

/** Candidates examined per SLA rule per sweep (backpressure cap). */
const SLA_SWEEP_BATCH = 100;

/** Actor recorded on records the engine creates. */
const SYSTEM_ACTOR = 'system:automation';

/** {{field}} → context value; unknown fields render as empty string. */
function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = context[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

@Injectable()
export class AutomationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationsService.name);
  private slaTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(AutomationRule.name)
    private readonly ruleModel: Model<AutomationRuleDocument>,
    @InjectModel(AutomationRun.name)
    private readonly runModel: Model<AutomationRunDocument>,
    // Direct read access for the SLA idle sweep (same precedent as
    // Accounts/Activities: schemas registered, write paths stay in their
    // own modules — actions go through the owning services below).
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    private readonly eventBus: CrmEventBus,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly activitiesService: ActivitiesService,
    private readonly leadsService: LeadsService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly customersService: CustomersService,
    private readonly contactsService: ContactsService,
  ) {}

  // ── Engine lifecycle ────────────────────────────────────────────────────

  onModuleInit(): void {
    for (const event of CRM_EVENTS) {
      this.eventBus.on(event, (payload) => this.handleEvent(payload));
    }

    const sweepMinutes = Math.max(
      1,
      Number(this.configService.get('AUTOMATION_SLA_SWEEP_MINUTES', 5)),
    );
    this.slaTimer = setInterval(
      () => void this.runSlaSweep(),
      sweepMinutes * 60 * 1000,
    );
    // Don't keep the process alive just for the sweep (e.g. in tests)
    this.slaTimer.unref?.();
    this.logger.log(
      `Automation engine ready — listening to ${CRM_EVENTS.length} events, SLA sweep every ${sweepMinutes}m`,
    );
  }

  onModuleDestroy(): void {
    if (this.slaTimer) clearInterval(this.slaTimer);
  }

  // ── Trigger rules ───────────────────────────────────────────────────────

  private async handleEvent(payload: CrmEventPayload): Promise<void> {
    // Events carry no explicit organizationId param, but every domain
    // record does (doc.toObject() includes it) — rules must only fire for
    // the org that owns the triggering record, never cross-tenant.
    const organizationId = payload.record.organizationId as
      | Types.ObjectId
      | undefined;
    if (!organizationId) {
      this.logger.warn(
        `Event ${payload.event} for ${payload.recordType} ${payload.recordId} has no organizationId — skipping automation`,
      );
      return;
    }

    const rules = await this.ruleModel
      .find({
        organizationId,
        kind: 'trigger',
        isActive: true,
        triggerEvent: payload.event,
      })
      .exec();
    if (rules.length === 0) return;

    const context = this.buildContext(payload.record, payload.context, {
      recordType: payload.recordType,
      recordId: payload.recordId,
      event: payload.event,
    });

    for (const rule of rules) {
      try {
        if (!this.conditionsPass(rule.conditions, context)) continue;
        await this.executeRule(rule, {
          event: payload.event,
          recordType: payload.recordType,
          recordId: payload.recordId,
          record: payload.record,
          context,
        });
      } catch (error) {
        this.logger.error(
          `Rule "${rule.name}" failed on ${payload.event}:`,
          error,
        );
      }
    }
  }

  // ── SLA sweep ───────────────────────────────────────────────────────────

  /**
   * Escalate records that have sat idle (no write) longer than the rule's
   * threshold. Fires at most once per idle period: a record is skipped
   * while an escalation run newer than its updatedAt exists — touching the
   * record resets both the idle clock and the dedupe.
   */
  async runSlaSweep(): Promise<void> {
    const rules = await this.ruleModel
      .find({ kind: 'sla', isActive: true })
      .exec();

    for (const rule of rules) {
      if (!rule.slaEntity || !rule.slaIdleHours) continue;
      try {
        const idleBefore = new Date(
          Date.now() - rule.slaIdleHours * 60 * 60 * 1000,
        );
        // Candidates are scoped to the rule's own organization — an SLA
        // rule must never escalate another organization's records.
        const candidates = await this.findIdleRecords(
          rule.slaEntity,
          idleBefore,
          rule.organizationId,
        );

        for (const candidate of candidates) {
          const record = candidate.toObject() as unknown as Record<
            string,
            unknown
          >;
          const recordId = candidate._id;

          // Dedupe: already escalated since the record was last touched?
          const lastRun = await this.runModel
            .findOne({ ruleId: rule._id, recordId })
            .sort({ createdAt: -1 })
            .exec();
          const updatedAt = record.updatedAt as Date | undefined;
          if (
            lastRun?.createdAt &&
            updatedAt &&
            lastRun.createdAt > updatedAt
          ) {
            continue;
          }

          const context = this.buildContext(
            record,
            { idleHours: rule.slaIdleHours },
            {
              recordType: rule.slaEntity,
              recordId: recordId.toString(),
              event: 'sla.breach',
            },
          );
          if (!this.conditionsPass(rule.conditions, context)) continue;

          await this.executeRule(rule, {
            event: 'sla.breach',
            recordType: rule.slaEntity,
            recordId: recordId.toString(),
            record,
            context,
          });
        }
      } catch (error) {
        this.logger.error(`SLA rule "${rule.name}" sweep failed:`, error);
      }
    }
  }

  private async findIdleRecords(
    entity: SlaEntity,
    idleBefore: Date,
    organizationId: Types.ObjectId,
  ) {
    if (entity === 'lead') {
      return this.leadModel
        .find({
          organizationId,
          status: { $in: OPEN_LEAD_STATUSES },
          updatedAt: { $lt: idleBefore },
        })
        .limit(SLA_SWEEP_BATCH)
        .exec();
    }
    if (entity === 'ticket') {
      // Only tickets where the ball is in the team's court can breach
      return this.ticketModel
        .find({
          organizationId,
          status: { $in: ACTIVE_TICKET_STATUSES },
          updatedAt: { $lt: idleBefore },
        })
        .limit(SLA_SWEEP_BATCH)
        .exec();
    }
    return this.opportunityModel
      .find({
        organizationId,
        stage: { $in: OPPORTUNITY_STAGES_OPEN },
        updatedAt: { $lt: idleBefore },
      })
      .limit(SLA_SWEEP_BATCH)
      .exec();
  }

  // ── Condition evaluation ────────────────────────────────────────────────

  /** Flatten the record + transition extras into one lookup object. */
  private buildContext(
    record: Record<string, unknown>,
    extras: Record<string, unknown>,
    meta: Record<string, unknown>,
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object' && !(value instanceof Date)) continue;
      context[key] = value instanceof Date ? value.toISOString() : value;
    }
    Object.assign(context, extras, meta);
    return context;
  }

  /** All conditions must pass (AND). No conditions = always pass. */
  private conditionsPass(
    conditions: RuleCondition[],
    context: Record<string, unknown>,
  ): boolean {
    return conditions.every((condition) => {
      const actual = context[condition.field];
      const expected = condition.value;

      switch (condition.operator) {
        case 'equals':
          return String(actual ?? '').toLowerCase() === expected.toLowerCase();
        case 'not_equals':
          return String(actual ?? '').toLowerCase() !== expected.toLowerCase();
        case 'contains':
          return String(actual ?? '')
            .toLowerCase()
            .includes(expected.toLowerCase());
        case 'greater_than':
          return Number(actual) > Number(expected);
        case 'less_than':
          return Number(actual) < Number(expected);
        case 'crossed_above': {
          // Transition check: previous<Field> < threshold ≤ new<Field>
          const prev = Number(
            context[`previous${capitalize(condition.field)}`],
          );
          const next = Number(context[`new${capitalize(condition.field)}`]);
          const threshold = Number(expected);
          return (
            !Number.isNaN(prev) &&
            !Number.isNaN(next) &&
            prev < threshold &&
            next >= threshold
          );
        }
        default:
          return false;
      }
    });
  }

  // ── Action execution ────────────────────────────────────────────────────

  private async executeRule(
    rule: AutomationRuleDocument,
    run: {
      event: string;
      recordType: string;
      recordId: string;
      record: Record<string, unknown>;
      context: Record<string, unknown>;
    },
  ): Promise<void> {
    const logs: string[] = [];
    let failures = 0;

    for (const action of rule.actions) {
      try {
        const log = await this.executeAction(action, rule, run);
        logs.push(`✓ ${action.type}: ${log}`);
      } catch (error) {
        failures += 1;
        logs.push(
          `✗ ${action.type}: ${error instanceof Error ? error.message : 'failed'}`,
        );
      }
    }

    const status: RunStatus =
      failures === 0
        ? 'success'
        : failures === rule.actions.length
          ? 'failed'
          : 'partial';

    await this.runModel.create({
      organizationId: rule.organizationId,
      ruleId: rule._id,
      ruleName: rule.name,
      event: run.event,
      recordType: run.recordType,
      recordId: new Types.ObjectId(run.recordId),
      recordName: this.displayNameFor(run.record),
      status,
      logs,
    });
    await this.ruleModel
      .updateOne(
        { _id: rule._id },
        { $set: { lastRunAt: new Date() }, $inc: { runCount: 1 } },
      )
      .exec();

    this.logger.log(
      `Rule "${rule.name}" ran on ${run.recordType} ${run.recordId} (${status})`,
    );
  }

  private async executeAction(
    action: RuleAction,
    rule: AutomationRuleDocument,
    run: {
      recordType: string;
      recordId: string;
      record: Record<string, unknown>;
      context: Record<string, unknown>;
    },
  ): Promise<string> {
    switch (action.type) {
      case 'create_task': {
        // Assignee: the record's owner (validated staff), else rule creator
        let assignee = run.record.assignedToId as string | undefined;
        if (assignee) {
          const [staff] = await this.usersService.findStaffByKeycloakIds([
            assignee,
          ]);
          if (!staff) assignee = undefined;
        }
        assignee = assignee ?? rule.createdBy;

        const dueInDays = action.taskDueInDays ?? 1;
        const created = await this.activitiesService.create(
          {
            type: 'task',
            subject: renderTemplate(
              action.taskSubject ?? 'Follow up',
              run.context,
            ),
            description: action.taskDescription
              ? renderTemplate(action.taskDescription, run.context)
              : `Created by automation rule "${rule.name}"`,
            priority: action.taskPriority ?? 'normal',
            dueAt: new Date(
              Date.now() + dueInDays * 24 * 60 * 60 * 1000,
            ).toISOString(),
            relatedType: run.recordType as never,
            relatedId: run.recordId,
            assignedToId: assignee,
          },
          SYSTEM_ACTOR,
          rule.organizationId,
        );
        return `task "${created.subject}" → ${assignee}`;
      }

      case 'send_email': {
        const to = await this.resolveEmailRecipient(action, run.record);
        const subject = renderTemplate(
          action.emailSubject ?? `CRM notification: ${rule.name}`,
          run.context,
        );
        const body = renderTemplate(action.emailBody ?? '', run.context);
        await this.mailService.sendPlain(to, subject, body);
        return `email "${subject}" → ${to}`;
      }

      case 'assign_record': {
        const dto: { assignedToId?: string; assignedTeamId?: string } = {};
        if (action.assignToId) dto.assignedToId = action.assignToId;
        if (action.assignTeamId)
          dto.assignedTeamId = action.assignTeamId.toString();
        if (!dto.assignedToId && !dto.assignedTeamId) {
          throw new Error('assign_record action has no target configured');
        }

        switch (run.recordType) {
          case 'lead':
            await this.leadsService.assign(
              run.recordId,
              dto,
              rule.organizationId,
            );
            break;
          case 'opportunity':
            await this.opportunitiesService.assign(
              run.recordId,
              dto,
              rule.organizationId,
            );
            break;
          case 'customer':
            await this.customersService.assign(
              run.recordId,
              dto,
              rule.organizationId,
            );
            break;
          case 'contact':
            await this.contactsService.assign(
              run.recordId,
              dto,
              rule.organizationId,
            );
            break;
          default:
            throw new Error(`cannot assign record type ${run.recordType}`);
        }
        return `routed → owner=${dto.assignedToId ?? 'unchanged'}, team=${dto.assignedTeamId ?? 'unchanged'}`;
      }

      case 'call_webhook': {
        if (!action.webhookUrl) {
          throw new Error('call_webhook action has no URL configured');
        }
        const response = await fetch(action.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule: { id: rule._id.toString(), name: rule.name },
            event: run.context.event,
            recordType: run.recordType,
            recordId: run.recordId,
            data: run.context,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          throw new Error(`webhook responded ${response.status}`);
        }
        return `POST ${action.webhookUrl} → ${response.status}`;
      }

      default:
        throw new Error(`unknown action type`);
    }
  }

  private async resolveEmailRecipient(
    action: RuleAction,
    record: Record<string, unknown>,
  ): Promise<string> {
    if (action.emailTo === 'custom') {
      if (!action.emailAddress) {
        throw new Error('custom recipient has no email address configured');
      }
      return action.emailAddress;
    }
    if (action.emailTo === 'owner') {
      const ownerId = record.assignedToId as string | undefined;
      if (!ownerId) throw new Error('record has no owner to email');
      const [owner] = await this.usersService.findStaffByKeycloakIds([ownerId]);
      if (!owner?.email) throw new Error('record owner has no email');
      return owner.email;
    }
    // 'record' (default): the person's own email. Tickets have no email
    // field — resolve through the linked customer instead.
    let email = record.email as string | undefined;
    if (!email && record.customerId) {
      const customer = await this.customersService.findDocById(
        String(record.customerId),
      );
      email = customer?.email;
    }
    if (!email) throw new Error('record has no email field');
    return email;
  }

  private displayNameFor(record: Record<string, unknown>): string | undefined {
    if (record.firstName || record.lastName) {
      return `${String(record.firstName ?? '')} ${String(record.lastName ?? '')}`.trim();
    }
    if (record.name) return String(record.name);
    if (record.subject) return String(record.subject);
    return undefined;
  }

  // ── Rule CRUD (admin-facing) ────────────────────────────────────────────

  async create(
    dto: CreateAutomationRuleDto,
    createdBy: string,
    organizationId: Types.ObjectId,
  ): Promise<AutomationRuleResponseDto> {
    await this.validateRuleShape(dto);

    const rule = await this.ruleModel.create({
      organizationId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      kind: dto.kind,
      isActive: dto.isActive ?? true,
      triggerEvent: dto.kind === 'trigger' ? dto.triggerEvent : undefined,
      slaEntity: dto.kind === 'sla' ? dto.slaEntity : undefined,
      slaIdleHours: dto.kind === 'sla' ? dto.slaIdleHours : undefined,
      conditions: dto.conditions ?? [],
      actions: this.toActionDocs(dto.actions),
      createdBy,
    });

    this.logger.log(`Automation rule created: "${rule.name}" (${rule.kind})`);
    return toRuleResponseDto(rule);
  }

  async findAll(query: RuleQueryDto, organizationId: Types.ObjectId) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const filter: Record<string, unknown> = { organizationId };
    if (query.kind) filter.kind = query.kind;
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === 'true';

    const [items, total] = await Promise.all([
      this.ruleModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.ruleModel.countDocuments(filter).exec(),
    ]);

    return {
      data: items.map(toRuleResponseDto),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStats(organizationId: Types.ObjectId): Promise<AutomationStatsDto> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      totalRules,
      activeRules,
      triggerRules,
      slaRules,
      runsLast24h,
      failedRunsLast24h,
    ] = await Promise.all([
      this.ruleModel.countDocuments({ organizationId }).exec(),
      this.ruleModel.countDocuments({ organizationId, isActive: true }).exec(),
      this.ruleModel
        .countDocuments({ organizationId, kind: 'trigger' })
        .exec(),
      this.ruleModel.countDocuments({ organizationId, kind: 'sla' }).exec(),
      this.runModel
        .countDocuments({ organizationId, createdAt: { $gte: dayAgo } })
        .exec(),
      this.runModel
        .countDocuments({
          organizationId,
          createdAt: { $gte: dayAgo },
          status: 'failed',
        })
        .exec(),
    ]);

    return {
      totalRules,
      activeRules,
      triggerRules,
      slaRules,
      runsLast24h,
      failedRunsLast24h,
    };
  }

  async findOne(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<AutomationRuleResponseDto> {
    return toRuleResponseDto(await this.getByIdOrFail(id, organizationId));
  }

  async update(
    id: string,
    dto: UpdateAutomationRuleDto,
    organizationId: Types.ObjectId,
  ): Promise<AutomationRuleResponseDto> {
    const rule = await this.getByIdOrFail(id, organizationId);

    if (dto.name !== undefined) rule.name = dto.name.trim();
    if (dto.description !== undefined)
      rule.description = dto.description.trim();
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    if (dto.triggerEvent !== undefined && rule.kind === 'trigger')
      rule.triggerEvent = dto.triggerEvent;
    if (dto.slaEntity !== undefined && rule.kind === 'sla')
      rule.slaEntity = dto.slaEntity;
    if (dto.slaIdleHours !== undefined && rule.kind === 'sla')
      rule.slaIdleHours = dto.slaIdleHours;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions;
    if (dto.actions !== undefined)
      rule.actions = this.toActionDocs(dto.actions);

    await this.validateRuleShape({
      kind: rule.kind,
      triggerEvent: rule.triggerEvent,
      slaEntity: rule.slaEntity,
      slaIdleHours: rule.slaIdleHours,
      actions: rule.actions,
    });

    await rule.save();
    this.logger.log(`Automation rule updated: ${id}`);
    return toRuleResponseDto(rule);
  }

  async remove(id: string, organizationId: Types.ObjectId): Promise<void> {
    const rule = await this.getByIdOrFail(id, organizationId);
    await this.ruleModel.deleteOne({ _id: rule._id }).exec();
    this.logger.log(`Automation rule deleted: ${id} ("${rule.name}")`);
  }

  async findRuns(query: RunQueryDto, organizationId: Types.ObjectId) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const filter: Record<string, unknown> = { organizationId };
    if (query.ruleId) filter.ruleId = new Types.ObjectId(query.ruleId);
    if (query.status) filter.status = query.status;

    const [items, total] = await Promise.all([
      this.runModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.runModel.countDocuments(filter).exec(),
    ]);

    return {
      data: items.map(toRunResponseDto),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // ── Validation helpers ──────────────────────────────────────────────────

  /** DTO actions → schema shape (assignTeamId string → ObjectId). */
  private toActionDocs(actions: RuleActionDto[]): RuleAction[] {
    return actions.map((a) => ({
      ...a,
      assignTeamId: a.assignTeamId
        ? new Types.ObjectId(a.assignTeamId)
        : undefined,
    }));
  }

  /** Kind-specific requireds + per-action parameter checks. */
  private async validateRuleShape(rule: {
    kind: string;
    triggerEvent?: string;
    slaEntity?: string;
    slaIdleHours?: number;
    actions: (RuleAction | RuleActionDto)[];
  }): Promise<void> {
    if (rule.kind === 'trigger' && !rule.triggerEvent) {
      throw new BadRequestException('Trigger rules need a triggerEvent');
    }
    if (rule.kind === 'sla' && (!rule.slaEntity || !rule.slaIdleHours)) {
      throw new BadRequestException(
        'SLA rules need slaEntity and slaIdleHours',
      );
    }

    for (const action of rule.actions) {
      if (action.type === 'create_task' && !action.taskSubject?.trim()) {
        throw new BadRequestException('create_task actions need a taskSubject');
      }
      if (action.type === 'send_email') {
        if (!action.emailTo) {
          throw new BadRequestException(
            'send_email actions need a recipient (emailTo)',
          );
        }
        if (action.emailTo === 'custom' && !action.emailAddress) {
          throw new BadRequestException(
            'send_email with a custom recipient needs emailAddress',
          );
        }
        if (!action.emailSubject?.trim() || !action.emailBody?.trim()) {
          throw new BadRequestException(
            'send_email actions need emailSubject and emailBody',
          );
        }
      }
      if (action.type === 'assign_record') {
        if (!action.assignToId && !action.assignTeamId) {
          throw new BadRequestException(
            'assign_record actions need assignToId and/or assignTeamId',
          );
        }
        if (action.assignToId) {
          const [staff] = await this.usersService.findStaffByKeycloakIds([
            action.assignToId,
          ]);
          if (!staff) {
            throw new BadRequestException(
              'assign_record target must be an existing staff user',
            );
          }
        }
        if (action.assignTeamId) {
          const team = await this.teamsService.findDocById(
            action.assignTeamId.toString(),
          );
          if (!team || !team.isActive) {
            throw new BadRequestException(
              'assign_record target team must exist and be active',
            );
          }
        }
      }
      if (action.type === 'call_webhook' && !action.webhookUrl) {
        throw new BadRequestException('call_webhook actions need webhookUrl');
      }
    }
  }

  /** Load a rule by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(
    id: string,
    organizationId: Types.ObjectId,
  ): Promise<AutomationRuleDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Automation rule with ID ${id} not found`);
    }
    const rule = await this.ruleModel
      .findOne({ _id: id, organizationId })
      .exec();
    if (!rule) {
      throw new NotFoundException(`Automation rule with ID ${id} not found`);
    }
    return rule;
  }
}
