import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** What kind of change happened. Shared across every entity type below. */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'assign',
  'status_change',
  'stage_change',
  'convert',
  'invite_sent',
  'login_success',
  'login_failed',
  'password_reset_requested',
  'password_reset_completed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** What kind of record the change happened to. 'auth' covers login/password events with no single record. */
export const AUDIT_ENTITY_TYPES = [
  'contact',
  'account',
  'lead',
  'opportunity',
  'customer',
  'ticket',
  'team',
  'automation_rule',
  'user',
  'organization',
  'auth',
  'custom_field_definition',
  'attachment',
  'custom_role',
  'mail_settings',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Immutable record of who did what to which record. Never updated after
 * creation — only ever inserted or read. See AuditService.log(), which is
 * the only writer and swallows its own failures so a broken audit write can
 * never fail the operation it's recording.
 */
@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  /** Keycloak subject id of whoever performed the action; absent for anonymous/public actions. */
  @Prop()
  actorId?: string;

  /** Display name captured at write time — stays accurate even if the actor is later renamed or removed. */
  @Prop()
  actorName?: string;

  @Prop()
  actorEmail?: string;

  @Prop({ type: String, required: true, enum: AUDIT_ACTIONS })
  action: AuditAction;

  @Prop({ type: String, required: true, enum: AUDIT_ENTITY_TYPES })
  entityType: AuditEntityType;

  @Prop()
  entityId?: string;

  /** Human-readable label for the affected record (name/email/subject/number). */
  @Prop()
  entityLabel?: string;

  /** One-line human-readable description, e.g. "Moved deal to Closed Won". */
  @Prop({ required: true })
  summary: string;

  /** Field-level diff for update actions — only fields that actually changed. */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  changes: AuditFieldChange[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  before?: object | null;

  @Prop({ type: MongooseSchema.Types.Mixed })
  after?: object | null;

  /** Free-form extra context (e.g. { reason: 'lost to competitor' }). */
  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({
  organizationId: 1,
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});
AuditLogSchema.index({ organizationId: 1, actorId: 1, createdAt: -1 });
