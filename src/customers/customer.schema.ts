import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
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

  @Prop({ type: String, enum: ['active', 'inactive', 'prospect'], default: 'active' })
  status: 'active' | 'inactive' | 'prospect';

  @Prop({ required: true, index: true })
  createdBy: string; // keycloakId of staff who created the customer
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
