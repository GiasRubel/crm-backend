import type {
  AccountIndustry,
  AccountSize,
  AccountStatus,
} from '../account.schema';

export class AccountResponseDto {
  id: string;
  name: string;
  industry: AccountIndustry | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  size: AccountSize | null;
  annualRevenue: number | null;
  address: string | null;
  description: string | null;
  status: AccountStatus;
  /** Number of contacts linked to this account (denormalized per page). */
  contactCount: number;
  /** Number of open deals linked to this account (denormalized per page). */
  openDealCount: number;
  createdBy: string;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
