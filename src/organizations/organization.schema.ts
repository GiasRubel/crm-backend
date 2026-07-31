import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  slug: string;

  @Prop({ type: String, enum: ORGANIZATION_STATUSES, default: 'active' })
  status: OrganizationStatus;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
