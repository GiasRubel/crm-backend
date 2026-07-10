import { AccountResponseDto } from './account-response.dto';
import type { OpportunityStage } from '../../opportunities/opportunity.schema';
import type { PreferredChannel } from '../../contacts/contact.schema';

/** Lightweight contact row inside the 360° account view. */
export class AccountContactSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  preferredChannel: PreferredChannel;
  doNotContact: boolean;
}

/** Lightweight deal row inside the 360° account view. */
export class AccountDealSummaryDto {
  id: string;
  name: string;
  stage: OpportunityStage;
  amount: number;
  expectedCloseDate: string | null;
  closedAt: string | null;
}

/** The 360-degree view: profile + linked people + linked deals + totals. */
export class AccountSummaryDto {
  account: AccountResponseDto;
  contacts: AccountContactSummaryDto[];
  opportunities: AccountDealSummaryDto[];
  metrics: {
    contactCount: number;
    openDealCount: number;
    openValue: number;
    wonValue: number;
    lostValue: number;
  };
}
