import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type LeadDocument = HydratedDocument<Lead>;

export const LEAD_SOURCES = [
  'web_form',
  'api',
  'manual',
  'referral',
  'event',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'converted',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ENGAGEMENT_TYPES = [
  'email_opened',
  'email_replied',
  'call',
  'meeting',
  'website_visit',
  'form_submitted',
  'note',
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

/**
 * Default score contribution per engagement type. Callers may override the
 * points on a single engagement; the lead score is the clamped (0–100) sum.
 */
export const ENGAGEMENT_DEFAULT_POINTS: Record<EngagementType, number> = {
  email_opened: 5,
  email_replied: 10,
  call: 15,
  meeting: 25,
  website_visit: 3,
  form_submitted: 10,
  note: 0,
};

/** Score thresholds for the derived temperature rating (see lead.mapper.ts). */
export const LEAD_RATING_THRESHOLDS = { hot: 70, warm: 40 } as const;

@Schema({ _id: false })
export class LeadEngagement {
  @Prop({ type: String, enum: ENGAGEMENT_TYPES, required: true })
  type: EngagementType;

  /** Score points this event contributed (already resolved, may be custom). */
  @Prop({ required: true })
  points: number;

  @Prop({ trim: true })
  note?: string;

  /** keycloakId of the staff user who logged it; absent for system events. */
  @Prop()
  recordedBy?: string;

  @Prop({ required: true })
  occurredAt: Date;
}

export const LeadEngagementSchema =
  SchemaFactory.createForClass(LeadEngagement);

@Schema({ timestamps: true })
export class Lead {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  company?: string;

  @Prop({ trim: true })
  jobTitle?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: String, enum: LEAD_SOURCES, required: true, default: 'manual' })
  source: LeadSource;

  @Prop({
    type: String,
    enum: LEAD_STATUSES,
    default: 'new',
    index: true,
  })
  status: LeadStatus;

  /** Engagement score, clamped to 0–100. Recomputed from `engagements`. */
  @Prop({ default: 0, min: 0, max: 100 })
  score: number;

  @Prop({ type: [LeadEngagementSchema], default: [] })
  engagements: LeadEngagement[];

  /** Deal size the rep expects if this lead converts (indicative only). */
  @Prop({ min: 0 })
  estimatedValue?: number;

  /**
   * keycloakId of the staff creator, or a `system:*` tag for unattended
   * ingestion (`system:web-form`, `system:api`).
   */
  @Prop({ required: true, index: true })
  createdBy: string;

  /** keycloakId of the staff user who owns this record (record owner). */
  @Prop({ index: true })
  assignedToId?: string;

  /** Team this record is routed to; drives row-level visibility for members. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team', index: true })
  assignedTeamId?: Types.ObjectId;

  // ── Conversion outcome (set once, when status becomes 'converted') ──────
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
  convertedCustomerId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Opportunity' })
  convertedOpportunityId?: Types.ObjectId;

  @Prop()
  convertedAt?: Date;

  /** keycloakId of the staff user who ran the conversion. */
  @Prop()
  convertedBy?: string;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

/** Statuses in which a lead is still being worked (dedupe target on capture). */
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
];
