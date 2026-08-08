import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import type { CalendarProvider } from './calendar-connection.schema';

export type CalendarOauthStateDocument = HydratedDocument<CalendarOauthState>;

/**
 * Short-lived CSRF token for the OAuth authorize→callback round trip.
 * TTL-indexed (mirrors otp/otp.schema.ts) — Mongo deletes it automatically.
 */
@Schema()
export class CalendarOauthState {
  @Prop({ required: true, unique: true })
  state: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  userId: string;

  @Prop({ type: String, required: true })
  provider: CalendarProvider;

  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export const CalendarOauthStateSchema =
  SchemaFactory.createForClass(CalendarOauthState);
