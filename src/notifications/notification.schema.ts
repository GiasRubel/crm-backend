import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** Records a notification can point back to. */
export const NOTIFICATION_ENTITY_TYPES = [
  'lead',
  'contact',
  'account',
  'opportunity',
  'customer',
  'ticket',
] as const;
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

export const NOTIFICATION_TYPES = ['assignment', 'comment'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  /** keycloakId of the staff member this notification is for. */
  @Prop({ required: true, index: true })
  recipientId: string;

  @Prop({ type: String, enum: NOTIFICATION_TYPES, required: true })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ trim: true, maxlength: 500 })
  body?: string;

  @Prop({ type: String, enum: NOTIFICATION_ENTITY_TYPES, required: true })
  entityType: NotificationEntityType;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ default: false, index: true })
  isRead: boolean;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({
  organizationId: 1,
  recipientId: 1,
  isRead: 1,
  createdAt: -1,
});
