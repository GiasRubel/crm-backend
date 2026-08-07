import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** Records a file can be attached to. */
export const ATTACHMENT_ENTITY_TYPES = [
  'lead',
  'contact',
  'account',
  'opportunity',
  'customer',
  'ticket',
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export type AttachmentDocument = HydratedDocument<Attachment>;

@Schema({ timestamps: true, collection: 'attachments' })
export class Attachment {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ type: String, enum: ATTACHMENT_ENTITY_TYPES, required: true })
  entityType: AttachmentEntityType;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  entityId: Types.ObjectId;

  /** User-supplied filename, shown in the UI — never used to build a disk path. */
  @Prop({ required: true, trim: true, maxlength: 255 })
  originalName: string;

  /** Generated on-disk filename (uuid + extension) — collision-free, no path traversal risk. */
  @Prop({ required: true })
  storedName: string;

  @Prop({ required: true, maxlength: 255 })
  mimeType: string;

  @Prop({ required: true, min: 0 })
  size: number;

  /** keycloakId of the uploader. */
  @Prop({ required: true })
  uploadedBy: string;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
AttachmentSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });
