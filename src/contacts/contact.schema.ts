import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ContactDocument = HydratedDocument<Contact>;

export const INTERACTION_TYPES = [
  'call',
  'email',
  'meeting',
  'sms',
  'note',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_DIRECTIONS = ['inbound', 'outbound'] as const;
export type InteractionDirection = (typeof INTERACTION_DIRECTIONS)[number];

export const PREFERRED_CHANNELS = ['email', 'phone', 'sms'] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

/** One entry in a contact's communication history. */
@Schema({ _id: false })
export class ContactInteraction {
  @Prop({ type: String, enum: INTERACTION_TYPES, required: true })
  type: InteractionType;

  /** Who initiated it. Omitted for notes. */
  @Prop({ type: String, enum: INTERACTION_DIRECTIONS })
  direction?: InteractionDirection;

  @Prop({ trim: true })
  subject?: string;

  @Prop({ trim: true })
  note?: string;

  /** keycloakId of the staff user who logged it. */
  @Prop({ required: true })
  recordedBy: string;

  @Prop({ required: true })
  occurredAt: Date;
}

export const ContactInteractionSchema =
  SchemaFactory.createForClass(ContactInteraction);

/**
 * Individual person profile: demographic data, communication history, and
 * contact preferences. May be linked to an Account (B2B) and/or to a
 * Customer record (when the person has a portal sign-in).
 */
@Schema({ timestamps: true })
export class Contact {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  /** Uniqueness (case-insensitive) enforced in the service — central dedupe. */
  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  jobTitle?: string;

  @Prop({ trim: true })
  department?: string;

  // ── Demographics ────────────────────────────────────────────────────────
  @Prop()
  birthday?: Date;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  country?: string;

  /** Preferred correspondence language (free text, e.g. "en", "German"). */
  @Prop({ trim: true })
  language?: string;

  // ── Links ───────────────────────────────────────────────────────────────
  /** The company this person belongs to (B2B). */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', index: true })
  accountId?: Types.ObjectId;

  /** At most one primary contact per account (enforced in the service). */
  @Prop({ default: false })
  isPrimary: boolean;

  /** Portal identity bridge: the Customer record for this person, if any. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  // ── Preferences ─────────────────────────────────────────────────────────
  @Prop({ type: String, enum: PREFERRED_CHANNELS, default: 'email' })
  preferredChannel: PreferredChannel;

  @Prop({ default: true })
  emailOptIn: boolean;

  @Prop({ default: true })
  phoneOptIn: boolean;

  @Prop({ default: false })
  smsOptIn: boolean;

  /** Hard stop: overrides every opt-in. Surfaced prominently in the UI. */
  @Prop({ default: false, index: true })
  doNotContact: boolean;

  // ── History & notes ─────────────────────────────────────────────────────
  @Prop({ type: [ContactInteractionSchema], default: [] })
  interactions: ContactInteraction[];

  @Prop({ trim: true })
  notes?: string;

  /** keycloakId of the staff creator. */
  @Prop({ required: true, index: true })
  createdBy: string;

  /** keycloakId of the staff user who owns this record (record owner). */
  @Prop({ index: true })
  assignedToId?: string;

  /** Team this record is routed to; drives row-level visibility for members. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team', index: true })
  assignedTeamId?: Types.ObjectId;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
