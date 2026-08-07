import { OpportunityStage } from '../opportunity.schema';

export class StageTransitionResponseDto {
  from: OpportunityStage;
  to: OpportunityStage;
  movedBy: string;
  movedByName: string | null;
  movedAt: string;
}

export class OpportunityResponseDto {
  id: string;
  name: string;
  customerId: string;
  customerName: string | null;
  leadId: string | null;
  accountId: string | null;
  accountName: string | null;
  amount: number;
  stage: OpportunityStage;
  probability: number;
  /** amount × probability / 100 — the forecast contribution of this deal. */
  weightedAmount: number;
  expectedCloseDate: string | null;
  notes?: string;
  closedAt: string | null;
  lostReason: string | null;
  stageHistory: StageTransitionResponseDto[];
  createdBy: string;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
