import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses that grant full (non-soft-locked) access. */
export const SUBSCRIPTION_ACTIVE_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
];

@Schema({ timestamps: true })
export class Subscription {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    unique: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  stripeCustomerId: string;

  @Prop()
  stripeSubscriptionId?: string;

  /** Stripe Price id for the plan the org is on. */
  @Prop()
  planId?: string;

  @Prop({
    type: String,
    enum: SUBSCRIPTION_STATUSES,
    default: 'incomplete',
  })
  status: SubscriptionStatus;

  @Prop()
  currentPeriodEnd?: Date;

  // Managed by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
