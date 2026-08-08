import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrgMailSettingsDocument = HydratedDocument<OrgMailSettings>;

/**
 * Per-organization custom SMTP override for outbound transactional mail
 * (OTP, invites, automation `send_email` actions). Outbound only — no
 * inbox ingestion or threading. Falls back to the system-wide MAIL_* env
 * config when absent or `enabled: false`.
 */
@Schema({ timestamps: true })
export class OrgMailSettings {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ trim: true })
  host?: string;

  @Prop()
  port?: number;

  @Prop({ default: false })
  secure: boolean;

  @Prop({ trim: true })
  user?: string;

  /** AES-256-GCM ciphertext of the SMTP password — never returned to clients. */
  @Prop()
  encryptedPass?: string;

  @Prop({ trim: true, lowercase: true })
  fromAddress?: string;

  @Prop({ trim: true })
  fromName?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrgMailSettingsSchema =
  SchemaFactory.createForClass(OrgMailSettings);
