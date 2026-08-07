import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type OpportunityDocument = HydratedDocument<Opportunity>;

export const OPPORTUNITY_STAGES = [
  'discovery',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGES_OPEN = [
  'discovery',
  'proposal',
  'negotiation',
] as const;
export type OpportunityOpenStage = (typeof OPPORTUNITY_STAGES_OPEN)[number];

export const CLOSED_STAGES: readonly OpportunityStage[] = [
  'closed_won',
  'closed_lost',
];

/** Default win probability per stage; synced on every stage move. */
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  discovery: 20,
  proposal: 40,
  negotiation: 60,
  closed_won: 100,
  closed_lost: 0,
};

@Schema({ _id: false })
export class StageTransition {
  @Prop({ type: String, enum: OPPORTUNITY_STAGES, required: true })
  from: OpportunityStage;

  @Prop({ type: String, enum: OPPORTUNITY_STAGES, required: true })
  to: OpportunityStage;

  /** keycloakId of the staff user who moved the deal. */
  @Prop({ required: true })
  movedBy: string;

  @Prop({ required: true })
  movedAt: Date;
}

export const StageTransitionSchema =
  SchemaFactory.createForClass(StageTransition);

@Schema({ timestamps: true })
export class Opportunity {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** The customer/contact this deal is with. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  })
  customerId: Types.ObjectId;

  /** Origin lead, when the deal came from a lead conversion. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  /** B2B company (Account) this deal belongs to, if any. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', index: true })
  accountId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    type: String,
    enum: OPPORTUNITY_STAGES,
    default: 'discovery',
    index: true,
  })
  stage: OpportunityStage;

  /** Win probability (0–100); follows STAGE_PROBABILITY on stage moves. */
  @Prop({ required: true, min: 0, max: 100, default: 20 })
  probability: number;

  @Prop()
  expectedCloseDate?: Date;

  @Prop({ trim: true })
  notes?: string;

  /** Set when the deal enters a closed stage; cleared on reopen. */
  @Prop()
  closedAt?: Date;

  /** Required when the deal is moved to closed_lost. */
  @Prop({ trim: true })
  lostReason?: string;

  @Prop({ type: [StageTransitionSchema], default: [] })
  stageHistory: StageTransition[];

  /** keycloakId of the staff creator, or `system:lead-conversion`. */
  @Prop({ required: true, index: true })
  createdBy: string;

  /** keycloakId of the staff user who owns this record (record owner). */
  @Prop({ index: true })
  assignedToId?: string;

  /** Team this record is routed to; drives row-level visibility for members. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team', index: true })
  assignedTeamId?: Types.ObjectId;

  /** Admin-defined field values, keyed by CustomFieldDefinition.key. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  customFields?: Record<string, unknown>;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const OpportunitySchema = SchemaFactory.createForClass(Opportunity);
