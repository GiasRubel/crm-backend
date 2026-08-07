import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AccountDocument = HydratedDocument<Account>;

export const ACCOUNT_INDUSTRIES = [
  'technology',
  'finance',
  'healthcare',
  'manufacturing',
  'retail',
  'education',
  'government',
  'nonprofit',
  'other',
] as const;
export type AccountIndustry = (typeof ACCOUNT_INDUSTRIES)[number];

export const ACCOUNT_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
] as const;
export type AccountSize = (typeof ACCOUNT_SIZES)[number];

export const ACCOUNT_STATUSES = ['prospect', 'active', 'inactive'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * B2B company profile: firmographic data plus links to the people
 * (contacts) and deals (opportunities) attached to the organization.
 */
@Schema({ timestamps: true })
export class Account {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  /** Company name. Uniqueness (case-insensitive) enforced in the service. */
  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ type: String, enum: ACCOUNT_INDUSTRIES })
  industry?: AccountIndustry;

  @Prop({ trim: true })
  website?: string;

  /** Company switchboard / main contact email — not a person's. */
  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  /** Employee-count band (firmographic sizing). */
  @Prop({ type: String, enum: ACCOUNT_SIZES })
  size?: AccountSize;

  @Prop({ min: 0 })
  annualRevenue?: number;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ACCOUNT_STATUSES,
    default: 'prospect',
    index: true,
  })
  status: AccountStatus;

  /** keycloakId of the staff creator. */
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

export const AccountSchema = SchemaFactory.createForClass(Account);
