import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CalendarConnectionDocument = HydratedDocument<CalendarConnection>;

export const CALENDAR_PROVIDERS = ['google', 'microsoft'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const CALENDAR_CONNECTION_STATUSES = [
  'active',
  'error',
  'disconnected',
] as const;
export type CalendarConnectionStatus =
  (typeof CALENDAR_CONNECTION_STATUSES)[number];

/** One doc per (org, user, provider) — a staff member's link to their own calendar. */
@Schema({ timestamps: true })
export class CalendarConnection {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  /** keycloakId of the staff user this connection belongs to. */
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ type: String, enum: CALENDAR_PROVIDERS, required: true })
  provider: CalendarProvider;

  @Prop({ trim: true })
  providerAccountEmail?: string;

  /** AES-256-GCM encrypted (see token-crypto.util.ts) — never plaintext at rest. */
  @Prop({ required: true })
  accessTokenEnc: string;

  @Prop({ required: true })
  refreshTokenEnc: string;

  @Prop({ required: true })
  tokenExpiresAt: Date;

  @Prop()
  scope?: string;

  /** Provider-specific incremental-sync cursor (Google syncToken / Graph deltaLink). */
  @Prop()
  syncCursor?: string;

  @Prop({
    type: String,
    enum: CALENDAR_CONNECTION_STATUSES,
    default: 'active',
    index: true,
  })
  status: CalendarConnectionStatus;

  @Prop()
  lastError?: string;

  @Prop()
  lastSyncedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CalendarConnectionSchema =
  SchemaFactory.createForClass(CalendarConnection);

CalendarConnectionSchema.index(
  { organizationId: 1, userId: 1, provider: 1 },
  { unique: true },
);
