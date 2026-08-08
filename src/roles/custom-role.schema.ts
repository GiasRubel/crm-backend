import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CUSTOM_FIELD_ENTITY_TYPES } from '../custom-fields/custom-field-definition.schema';

/** Entities a custom role's permission matrix can address — same set as custom fields. */
export const PERMISSION_ENTITY_TYPES = CUSTOM_FIELD_ENTITY_TYPES;
export type PermissionEntityType = (typeof PERMISSION_ENTITY_TYPES)[number];

export const PERMISSION_ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Row-level scope for the 'read'/'update'/'delete' actions: org-wide, own+team, or own-only. */
export const PERMISSION_SCOPES = ['all', 'team', 'own'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export type CustomRoleDocument = HydratedDocument<CustomRole>;

@Schema({ _id: false })
export class EntityPermission {
  @Prop({ type: String, required: true, enum: PERMISSION_ENTITY_TYPES })
  entityType: PermissionEntityType;

  @Prop({ type: [String], enum: PERMISSION_ACTIONS, default: [] })
  actions: PermissionAction[];

  @Prop({ type: String, enum: PERMISSION_SCOPES, default: 'own' })
  scope: PermissionScope;
}
export const EntityPermissionSchema =
  SchemaFactory.createForClass(EntityPermission);

@Schema({ _id: false })
export class FieldRestriction {
  @Prop({ type: String, required: true, enum: PERMISSION_ENTITY_TYPES })
  entityType: PermissionEntityType;

  /** Matches CustomFieldDefinition.key for this entityType. */
  @Prop({ required: true, trim: true })
  fieldKey: string;

  /** Hidden fields are stripped from API responses entirely. */
  @Prop({ default: false })
  hidden: boolean;

  /** Read-only fields are visible but attempted value changes are silently dropped. */
  @Prop({ default: false })
  readonly: boolean;
}
export const FieldRestrictionSchema =
  SchemaFactory.createForClass(FieldRestriction);

/**
 * Admin-defined role, layered on top of AppRole.User. A staff member with
 * `role: User` and a `customRoleId` set has their CRUD access and row-level
 * visibility scope governed by this document instead of the legacy
 * full-access default. Admin/Administrator/PlatformAdmin always bypass this
 * entirely — custom roles only ever narrow a User-tier account.
 */
@Schema({ timestamps: true, collection: 'custom_roles' })
export class CustomRole {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 60 })
  name: string;

  @Prop({ trim: true, maxlength: 200 })
  description?: string;

  @Prop({ type: [EntityPermissionSchema], default: [] })
  permissions: EntityPermission[];

  @Prop({ type: [FieldRestrictionSchema], default: [] })
  fieldRestrictions: FieldRestriction[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const CustomRoleSchema = SchemaFactory.createForClass(CustomRole);

CustomRoleSchema.index({ organizationId: 1, name: 1 }, { unique: true });
