import { IsIn, IsOptional, IsString } from 'class-validator';
import { SUBSCRIPTION_STATUSES } from '../subscription.schema';
import type { SubscriptionStatus } from '../subscription.schema';

export class UpdateSubscriptionDto {
  @IsString()
  @IsOptional()
  stripeCustomerId?: string;

  @IsString()
  @IsOptional()
  stripeSubscriptionId?: string;

  @IsString()
  @IsOptional()
  planId?: string;

  @IsIn(SUBSCRIPTION_STATUSES)
  @IsOptional()
  status?: SubscriptionStatus;

  @IsOptional()
  currentPeriodEnd?: Date;
}
