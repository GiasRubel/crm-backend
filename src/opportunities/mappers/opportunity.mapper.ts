import { OpportunityDocument } from '../opportunity.schema';
import { OpportunityResponseDto } from '../dto/opportunity-response.dto';

export interface OpportunityLookupNames {
  /** keycloakId → staff display name */
  staffNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
  /** customerId → customer display name */
  customerNames?: Map<string, string>;
  /** accountId → account name */
  accountNames?: Map<string, string>;
}

export function toOpportunityResponseDto(
  opportunity: OpportunityDocument,
  names: OpportunityLookupNames = {},
): OpportunityResponseDto {
  const assignedToId = opportunity.assignedToId ?? null;
  const assignedTeamId = opportunity.assignedTeamId?.toString() ?? null;
  const customerId = opportunity.customerId.toString();
  const accountId = opportunity.accountId?.toString() ?? null;

  return {
    id: opportunity._id.toString(),
    name: opportunity.name,
    customerId,
    customerName: names.customerNames?.get(customerId) ?? null,
    leadId: opportunity.leadId?.toString() ?? null,
    accountId,
    accountName: (accountId && names.accountNames?.get(accountId)) || null,
    amount: opportunity.amount,
    stage: opportunity.stage,
    probability: opportunity.probability,
    weightedAmount: Math.round(
      (opportunity.amount * opportunity.probability) / 100,
    ),
    expectedCloseDate: opportunity.expectedCloseDate?.toISOString() ?? null,
    notes: opportunity.notes,
    closedAt: opportunity.closedAt?.toISOString() ?? null,
    lostReason: opportunity.lostReason ?? null,
    stageHistory: [...opportunity.stageHistory]
      .sort((a, b) => b.movedAt.getTime() - a.movedAt.getTime())
      .map((t) => ({
        from: t.from,
        to: t.to,
        movedBy: t.movedBy,
        movedByName: names.staffNames?.get(t.movedBy) ?? null,
        movedAt: t.movedAt.toISOString(),
      })),
    createdBy: opportunity.createdBy,
    assignedToId,
    assignedToName:
      (assignedToId && names.staffNames?.get(assignedToId)) || null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && names.teamNames?.get(assignedTeamId)) || null,
    customFields: opportunity.customFields ?? {},
    createdAt: opportunity.createdAt?.toISOString() ?? '',
    updatedAt: opportunity.updatedAt?.toISOString() ?? '',
  };
}
