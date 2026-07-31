import type { SubscriptionStatus } from '../subscription.schema';

export class SubscriptionResponseDto {
  id: string;
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  planId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}
