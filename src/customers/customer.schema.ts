import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  keycloakId: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ trim: true })
  company?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'prospect'],
    default: 'active',
  })
  status: 'active' | 'inactive' | 'prospect';

  @Prop({ required: true, index: true })
  createdBy: string; // keycloakId of staff who created the customer

  /** keycloakId of the staff user who owns this record (record owner). */
  @Prop({ index: true })
  assignedToId?: string;

  /** Team this record is routed to; drives row-level visibility for members. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Team', index: true })
  assignedTeamId?: Types.ObjectId;

  /** Admin-defined field values, keyed by CustomFieldDefinition.key. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  customFields?: Record<string, unknown>;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
