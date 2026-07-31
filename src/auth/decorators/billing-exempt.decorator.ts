import { SetMetadata } from '@nestjs/common';

export const IS_BILLING_EXEMPT_KEY = 'isBillingExempt';
export const BillingExempt = () => SetMetadata(IS_BILLING_EXEMPT_KEY, true);
