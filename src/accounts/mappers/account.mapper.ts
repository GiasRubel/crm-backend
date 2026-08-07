import { AccountDocument } from '../account.schema';
import { AccountResponseDto } from '../dto/account-response.dto';

export interface AccountLookupData {
  /** keycloakId → staff display name */
  staffNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
  /** accountId → number of linked contacts */
  contactCounts?: Map<string, number>;
  /** accountId → number of linked open deals */
  openDealCounts?: Map<string, number>;
}

export function toAccountResponseDto(
  account: AccountDocument,
  data: AccountLookupData = {},
): AccountResponseDto {
  const id = account._id.toString();
  const assignedToId = account.assignedToId ?? null;
  const assignedTeamId = account.assignedTeamId?.toString() ?? null;

  return {
    id,
    name: account.name,
    industry: account.industry ?? null,
    website: account.website ?? null,
    email: account.email ?? null,
    phone: account.phone ?? null,
    size: account.size ?? null,
    annualRevenue: account.annualRevenue ?? null,
    address: account.address ?? null,
    description: account.description ?? null,
    status: account.status,
    contactCount: data.contactCounts?.get(id) ?? 0,
    openDealCount: data.openDealCounts?.get(id) ?? 0,
    createdBy: account.createdBy,
    assignedToId,
    assignedToName:
      (assignedToId && data.staffNames?.get(assignedToId)) || null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && data.teamNames?.get(assignedTeamId)) || null,
    customFields: account.customFields ?? {},
    createdAt: account.createdAt?.toISOString() ?? '',
    updatedAt: account.updatedAt?.toISOString() ?? '',
  };
}
