import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

@Schema()
export class Otp {
  /** Links to the Keycloak subject (sub) — same as User.keycloakId */
  @Prop({ required: true, index: true })
  keycloakId: string;

  /** Hashed 6-digit code */
  @Prop({ required: true })
  code: string;

  /** Number of failed verification attempts */
  @Prop({ default: 0 })
  attempts: number;

  /** TTL field — MongoDB automatically deletes the document after this date */
  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
