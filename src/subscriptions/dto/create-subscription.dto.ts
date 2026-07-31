import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { SUBSCRIPTION_STATUSES } from '../subscription.schema';
import type { SubscriptionStatus } from '../subscription.schema';

export class CreateSubscriptionDto {
  @IsMongoId()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  stripeCustomerId: string;

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
