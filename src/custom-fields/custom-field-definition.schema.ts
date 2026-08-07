import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** Entities that support admin-configurable custom fields. */
export const CUSTOM_FIELD_ENTITY_TYPES = [
  'lead',
  'contact',
  'account',
  'opportunity',
  'customer',
  'ticket',
] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
  'url',
  'email',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Field types that require a non-empty `options` list. */
export const CUSTOM_FIELD_CHOICE_TYPES: readonly CustomFieldType[] = [
  'select',
  'multiselect',
];

export type CustomFieldDocument = HydratedDocument<CustomFieldDefinition>;

/**
 * Admin-defined field on one of the CRM's core entities. Values live on the
 * entity's own `customFields` map, keyed by `key`; this collection only
 * holds the field's shape (type, label, options, required-ness).
 */
@Schema({ timestamps: true, collection: 'custom_field_definitions' })
export class CustomFieldDefinition {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: CUSTOM_FIELD_ENTITY_TYPES,
    index: true,
  })
  entityType: CustomFieldEntityType;

  /** Stable machine key (lowercase, snake/camel, no spaces) — the storage key on `customFields`. */
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ type: String, required: true, enum: CUSTOM_FIELD_TYPES })
  type: CustomFieldType;

  /** Choices for `select`/`multiselect` fields; unused otherwise. */
  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({ default: false })
  required: boolean;

  /** Inactive definitions are hidden from forms but existing stored values are preserved. */
  @Prop({ default: true, index: true })
  isActive: boolean;

  /** Display order within the entity's field list, ascending. */
  @Prop({ default: 0 })
  order: number;

  @Prop({ trim: true, maxlength: 300 })
  helpText?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CustomFieldDefinitionSchema = SchemaFactory.createForClass(
  CustomFieldDefinition,
);

CustomFieldDefinitionSchema.index(
  { organizationId: 1, entityType: 1, key: 1 },
  { unique: true },
);
CustomFieldDefinitionSchema.index({
  organizationId: 1,
  entityType: 1,
  order: 1,
});
