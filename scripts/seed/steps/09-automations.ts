/**
 * Step 09 — automation rules and their execution log.
 *
 * The rules are the ones a real team actually builds: route hot leads, chase
 * stalled deals, escalate urgent tickets. Conditions reference fields that
 * exist on the flattened event context the engine builds
 * (`AutomationsService`), including the `previous<Field>`/`new<Field>` pair
 * that `crossed_above` reads.
 *
 * Runs are written directly rather than by firing the engine — the seeder
 * bypasses the services precisely so no side-effects escape mid-seed — and
 * `runCount`/`lastRunAt` are reconciled with the runs actually written.
 */
import { Types } from 'mongoose';
import {
  AutomationRule,
  AutomationRuleDocument,
} from '../../../src/automations/automation-rule.schema';
import {
  AutomationRun,
  AutomationRunDocument,
} from '../../../src/automations/automation-run.schema';
import { VOLUMES } from '../config';
import { adminStaff, model, SeedContext } from '../context';
import { between, historyMoment, int, NOW, pick, weighted } from '../rng';

interface RuleSpec {
  name: string;
  description: string;
  kind: 'trigger' | 'sla';
  triggerEvent?: string;
  slaEntity?: 'lead' | 'opportunity' | 'ticket';
  slaIdleHours?: number;
  conditions: { field: string; operator: string; value: string }[];
  /** `type` is always present; the rest are the per-action-type parameters. */
  actions: ({ type: string } & Record<string, unknown>)[];
  /** Which pool its runs draw from. */
  recordType: 'lead' | 'opportunity' | 'ticket' | 'customer' | 'contact';
  isActive: boolean;
}

const RULE_SPECS: RuleSpec[] = [
  {
    name: 'Welcome task for new web leads',
    description:
      'Every lead captured from the website gets a same-day follow-up task.',
    kind: 'trigger',
    triggerEvent: 'lead.created',
    conditions: [{ field: 'source', operator: 'equals', value: 'web_form' }],
    actions: [
      {
        type: 'create_task',
        taskSubject: 'Call {{firstName}} {{lastName}} — new web enquiry',
        taskDescription: 'Inbound web form lead. Qualify and set a next step.',
        taskDueInDays: 1,
        taskPriority: 'high',
      },
    ],
    recordType: 'lead',
    isActive: true,
  },
  {
    name: 'Notify owner when a lead turns hot',
    description: 'Emails the record owner the moment a lead score crosses 70.',
    kind: 'trigger',
    triggerEvent: 'lead.score_changed',
    conditions: [{ field: 'score', operator: 'crossed_above', value: '70' }],
    actions: [
      {
        type: 'send_email',
        emailTo: 'owner',
        emailSubject: '{{firstName}} {{lastName}} is now a hot lead',
        emailBody:
          'The lead score for {{firstName}} {{lastName}} ({{company}}) just crossed 70. Worth a call today.',
      },
    ],
    recordType: 'lead',
    isActive: true,
  },
  {
    name: 'Qualified leads get a discovery call task',
    description: 'Books discovery work as soon as a lead is marked qualified.',
    kind: 'trigger',
    triggerEvent: 'lead.status_changed',
    conditions: [
      { field: 'newStatus', operator: 'equals', value: 'qualified' },
    ],
    actions: [
      {
        type: 'create_task',
        taskSubject: 'Schedule discovery call with {{firstName}} {{lastName}}',
        taskDueInDays: 2,
        taskPriority: 'normal',
      },
    ],
    recordType: 'lead',
    isActive: true,
  },
  {
    name: 'Large deals alert the sales lead',
    description:
      'Any new opportunity above 50k is emailed to the sales leadership alias.',
    kind: 'trigger',
    triggerEvent: 'opportunity.created',
    conditions: [{ field: 'amount', operator: 'greater_than', value: '50000' }],
    actions: [
      {
        type: 'send_email',
        emailTo: 'custom',
        emailAddress: 'sales-leadership@northwind-demo.test',
        emailSubject: 'New large deal: {{name}}',
        emailBody: 'A new opportunity worth {{amount}} was created: {{name}}.',
      },
    ],
    recordType: 'opportunity',
    isActive: true,
  },
  {
    name: 'Proposal sent — schedule the follow-up',
    description:
      'Creates a chase task three days after a deal reaches proposal.',
    kind: 'trigger',
    triggerEvent: 'opportunity.stage_changed',
    conditions: [{ field: 'newStage', operator: 'equals', value: 'proposal' }],
    actions: [
      {
        type: 'create_task',
        taskSubject: 'Follow up on the proposal for {{name}}',
        taskDueInDays: 3,
        taskPriority: 'high',
      },
    ],
    recordType: 'opportunity',
    isActive: true,
  },
  {
    name: 'Closed-won handover to customer success',
    description:
      'Routes won deals to the customer success team for onboarding.',
    kind: 'trigger',
    triggerEvent: 'opportunity.stage_changed',
    conditions: [
      { field: 'newStage', operator: 'equals', value: 'closed_won' },
    ],
    actions: [
      {
        type: 'create_task',
        taskSubject: 'Onboarding handover: {{name}}',
        taskDescription:
          'Deal closed won. Schedule kick-off and assign an owner.',
        taskDueInDays: 5,
        taskPriority: 'normal',
      },
    ],
    recordType: 'opportunity',
    isActive: true,
  },
  {
    name: 'Urgent tickets page the escalation desk',
    description: 'Emails tier 2 whenever an urgent ticket is opened.',
    kind: 'trigger',
    triggerEvent: 'ticket.created',
    conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }],
    actions: [
      {
        type: 'send_email',
        emailTo: 'custom',
        emailAddress: 'escalations@northwind-demo.test',
        emailSubject: 'Urgent ticket {{number}}: {{subject}}',
        emailBody:
          'An urgent ticket was just raised. Please pick it up immediately.',
      },
      {
        type: 'create_task',
        taskSubject: 'Triage urgent ticket {{number}}',
        taskDueInDays: 1,
        taskPriority: 'high',
      },
    ],
    recordType: 'ticket',
    isActive: true,
  },
  {
    name: 'Billing tickets notify finance',
    description: 'Forwards billing-type tickets to the finance mailbox.',
    kind: 'trigger',
    triggerEvent: 'ticket.created',
    conditions: [{ field: 'type', operator: 'equals', value: 'billing' }],
    actions: [
      {
        type: 'send_email',
        emailTo: 'custom',
        emailAddress: 'finance@northwind-demo.test',
        emailSubject: 'Billing query on ticket {{number}}',
        emailBody: '{{subject}}',
      },
    ],
    recordType: 'ticket',
    isActive: false,
  },
  {
    name: 'New customer welcome sequence',
    description: 'Sends a welcome email when a customer record is created.',
    kind: 'trigger',
    triggerEvent: 'customer.created',
    conditions: [],
    actions: [
      {
        type: 'send_email',
        emailTo: 'record',
        emailSubject: 'Welcome to Northwind, {{firstName}}',
        emailBody:
          'Thanks for choosing us. Your onboarding manager will be in touch within two working days.',
      },
    ],
    recordType: 'customer',
    isActive: true,
  },
  {
    name: 'SLA — leads idle for 3 days',
    description: 'Escalates leads that have not been touched in 72 hours.',
    kind: 'sla',
    slaEntity: 'lead',
    slaIdleHours: 72,
    conditions: [
      { field: 'status', operator: 'not_equals', value: 'converted' },
    ],
    actions: [
      {
        type: 'create_task',
        taskSubject: 'Stalled lead: {{firstName}} {{lastName}}',
        taskDescription: 'No activity for three days. Re-engage or disqualify.',
        taskDueInDays: 1,
        taskPriority: 'high',
      },
    ],
    recordType: 'lead',
    isActive: true,
  },
  {
    name: 'SLA — deals stalled for two weeks',
    description: 'Flags open opportunities with no movement in 336 hours.',
    kind: 'sla',
    slaEntity: 'opportunity',
    slaIdleHours: 336,
    conditions: [
      { field: 'stage', operator: 'not_equals', value: 'closed_won' },
    ],
    actions: [
      {
        type: 'create_task',
        taskSubject: 'Stalled deal: {{name}}',
        taskDueInDays: 2,
        taskPriority: 'high',
      },
    ],
    recordType: 'opportunity',
    isActive: true,
  },
  {
    name: 'SLA — tickets unanswered for 8 hours',
    description:
      'Escalates active tickets with no response inside the SLA window.',
    kind: 'sla',
    slaEntity: 'ticket',
    slaIdleHours: 8,
    conditions: [{ field: 'priority', operator: 'not_equals', value: 'low' }],
    actions: [
      {
        type: 'send_email',
        emailTo: 'custom',
        emailAddress: 'escalations@northwind-demo.test',
        emailSubject: 'SLA breach on ticket {{number}}',
        emailBody: 'This ticket has breached the first-response SLA.',
      },
    ],
    recordType: 'ticket',
    isActive: true,
  },
];

const RUN_STATUS_MIX = [
  { value: 'success' as const, weight: 88 },
  { value: 'partial' as const, weight: 7 },
  { value: 'failed' as const, weight: 5 },
];

const FAILURE_LOGS = [
  'send_email: SMTP timeout after 30s',
  'call_webhook: remote returned 503',
  'assign_record: target user is no longer active',
  'send_email: recipient address rejected',
];

export async function seedAutomations(ctx: SeedContext): Promise<void> {
  const ruleModel = model<AutomationRuleDocument>(ctx.app, AutomationRule.name);
  const runModel = model<AutomationRunDocument>(ctx.app, AutomationRun.name);

  const admins = adminStaff(ctx).length ? adminStaff(ctx) : ctx.pools.staff;
  const specs = RULE_SPECS.slice(0, VOLUMES.automationRules);

  const ruleDocs: Record<string, unknown>[] = [];
  const runDocs: Record<string, unknown>[] = [];

  /** Record pool + display name resolver per rule target type. */
  const recordPool = (kind: RuleSpec['recordType']) => {
    switch (kind) {
      case 'lead':
        return ctx.pools.leads.map((l) => ({
          id: l.id,
          name: `${l.firstName} ${l.lastName}`,
          createdAt: l.createdAt,
        }));
      case 'opportunity':
        return ctx.pools.opportunities.map((o) => ({
          id: o.id,
          name: o.name,
          createdAt: o.createdAt,
        }));
      case 'ticket':
        return ctx.pools.tickets.map((t) => ({
          id: t.id,
          name: `${t.number} — ${t.subject}`,
          createdAt: t.createdAt,
        }));
      case 'customer':
        return ctx.pools.customers.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          createdAt: c.createdAt,
        }));
      default:
        return ctx.pools.contacts.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          createdAt: c.createdAt,
        }));
    }
  };

  // Runs are shared out across the active rules; an inactive rule keeps the
  // runs it accumulated before it was switched off, but gets no new ones.
  const activeSpecs = specs.filter((s) => s.isActive);
  const runsPerRule = Math.max(
    1,
    Math.floor(VOLUMES.automationRuns / Math.max(1, activeSpecs.length)),
  );

  for (const spec of specs) {
    const ruleId = new Types.ObjectId();
    const createdBy = pick(admins).keycloakId;
    const createdAt = historyMoment();
    const pool = recordPool(spec.recordType);

    const runCount = spec.isActive
      ? int(runsPerRule - 8, runsPerRule + 8)
      : int(2, 12);
    const runMoments: Date[] = [];

    for (let i = 0; i < runCount && pool.length; i++) {
      const record = pick(pool);
      // A rule can only have fired after both the rule and the record existed.
      const earliest =
        createdAt > record.createdAt ? createdAt : record.createdAt;
      if (earliest >= NOW) continue;
      const firedAt = between(earliest, NOW);
      runMoments.push(firedAt);

      const status = weighted(RUN_STATUS_MIX);
      const logs =
        status === 'success'
          ? spec.actions.map((a) => `${a.type}: ok`)
          : status === 'partial'
            ? [
                `${spec.actions[0]?.type ?? 'create_task'}: ok`,
                pick(FAILURE_LOGS),
              ]
            : [pick(FAILURE_LOGS)];

      runDocs.push({
        _id: new Types.ObjectId(),
        organizationId: ctx.organizationId,
        ruleId,
        // Denormalized on purpose: the log stays readable after a rule is deleted.
        ruleName: spec.name,
        event: spec.kind === 'sla' ? 'sla.breach' : spec.triggerEvent,
        recordType: spec.recordType,
        recordId: record.id,
        recordName: record.name,
        status,
        logs,
        createdAt: firedAt,
        updatedAt: firedAt,
      });
    }

    const lastRunAt = runMoments.length
      ? new Date(Math.max(...runMoments.map((d) => d.getTime())))
      : undefined;

    ruleDocs.push({
      _id: ruleId,
      organizationId: ctx.organizationId,
      name: spec.name,
      description: spec.description,
      kind: spec.kind,
      isActive: spec.isActive,
      triggerEvent: spec.triggerEvent,
      slaEntity: spec.slaEntity,
      slaIdleHours: spec.slaIdleHours,
      conditions: spec.conditions,
      actions: spec.actions,
      createdBy,
      lastRunAt,
      // Reconciled with the runs actually written, not an invented number.
      runCount: runMoments.length,
      createdAt,
      updatedAt: lastRunAt ?? createdAt,
    });
  }

  await ctx.insert('automationrules', ruleModel, ruleDocs);
  await ctx.insert('automationruns', runModel, runDocs);

  ctx.logger.log(
    `  ${ruleDocs.length} rules (${specs.filter((s) => s.kind === 'sla').length} SLA), ` +
      `${runDocs.length} runs logged`,
  );
}
