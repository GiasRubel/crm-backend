import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CRM_EVENTS } from '../events/crm-event-bus.service';
import type { CrmEvent } from '../events/crm-event-bus.service';

export type AutomationRuleDocument = HydratedDocument<AutomationRule>;

export const RULE_KINDS = ['trigger', 'sla'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/** Entities the SLA idle-sweep can monitor. */
export const SLA_ENTITIES = ['lead', 'opportunity', 'ticket'] as const;
export type SlaEntity = (typeof SLA_ENTITIES)[number];

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  /** For numeric transitions: previous value < threshold ≤ new value. */
  'crossed_above',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const ACTION_TYPES = [
  'create_task',
  'send_email',
  'assign_record',
  'call_webhook',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const EMAIL_RECIPIENTS = ['record', 'owner', 'custom'] as const;
export type EmailRecipient = (typeof EMAIL_RECIPIENTS)[number];

/**
 * One condition, evaluated against the flattened event context (record
 * fields + transition extras such as previousStatus/newStatus/newScore).
 * All conditions of a rule must pass (AND).
 */
@Schema({ _id: false })
export class RuleCondition {
  @Prop({ required: true, trim: true })
  field: string;

  @Prop({ type: String, enum: CONDITION_OPERATORS, required: true })
  operator: ConditionOperator;

  @Prop({ required: true, trim: true })
  value: string;
}
export const RuleConditionSchema = SchemaFactory.createForClass(RuleCondition);

/**
 * One action. Only the parameter group matching `type` is read; string
 * parameters support {{field}} placeholders resolved from the context.
 */
@Schema({ _id: false })
export class RuleAction {
  @Prop({ type: String, enum: ACTION_TYPES, required: true })
  type: ActionType;

  // create_task
  @Prop({ trim: true })
  taskSubject?: string;

  @Prop({ trim: true })
  taskDescription?: string;

  @Prop({ min: 0, max: 365 })
  taskDueInDays?: number;

  @Prop({ type: String, enum: ['low', 'normal', 'high'] })
  taskPriority?: 'low' | 'normal' | 'high';

  // send_email
  @Prop({ type: String, enum: EMAIL_RECIPIENTS })
  emailTo?: EmailRecipient;

  @Prop({ trim: true, lowercase: true })
  emailAddress?: string;

  @Prop({ trim: true })
  emailSubject?: string;

  @Prop({ trim: true })
  emailBody?: string;

  // assign_record
  @Prop({ trim: true })
  assignToId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team' })
  assignTeamId?: Types.ObjectId;

  // call_webhook
  @Prop({ trim: true })
  webhookUrl?: string;
}
export const RuleActionSchema = SchemaFactory.createForClass(RuleAction);

@Schema({ timestamps: true })
export class AutomationRule {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: String, enum: RULE_KINDS, required: true, index: true })
  kind: RuleKind;

  @Prop({ default: true, index: true })
  isActive: boolean;

  /** Trigger rules: which domain event fires this rule. */
  @Prop({ type: String, enum: CRM_EVENTS })
  triggerEvent?: CrmEvent;

  /** SLA rules: which entity to sweep and after how many idle hours. */
  @Prop({ type: String, enum: SLA_ENTITIES })
  slaEntity?: SlaEntity;

  @Prop({ min: 1, max: 24 * 90 })
  slaIdleHours?: number;

  @Prop({ type: [RuleConditionSchema], default: [] })
  conditions: RuleCondition[];

  @Prop({ type: [RuleActionSchema], required: true })
  actions: RuleAction[];

  /** keycloakId of the admin who created the rule (action fallbacks). */
  @Prop({ required: true })
  createdBy: string;

  @Prop()
  lastRunAt?: Date;

  @Prop({ default: 0 })
  runCount: number;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const AutomationRuleSchema =
  SchemaFactory.createForClass(AutomationRule);
