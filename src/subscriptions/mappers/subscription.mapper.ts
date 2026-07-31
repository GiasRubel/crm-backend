import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { SubscriptionDocument } from '../subscription.schema';

export function toSubscriptionResponseDto(
  subscription: SubscriptionDocument,
): SubscriptionResponseDto {
  return {
    id: subscription._id.toString(),
    organizationId: subscription.organizationId.toString(),
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
    planId: subscription.planId ?? null,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    createdAt: subscription.createdAt?.toISOString() ?? '',
    updatedAt: subscription.updatedAt?.toISOString() ?? '',
  };
}
