import { OpportunityStage } from '../opportunity.schema';

export class StageBucketDto {
  stage: OpportunityStage;
  count: number;
  totalAmount: number;
}

export class OpportunityStatsDto {
  /** Deals in an open stage (discovery/proposal/negotiation). */
  openCount: number;
  /** Sum of open-deal amounts. */
  openValue: number;
  /** Sum of open-deal amount × probability — the pipeline forecast. */
  weightedValue: number;
  wonThisMonthCount: number;
  wonThisMonthValue: number;
  /** closed_won / (closed_won + closed_lost), rounded percent, all-time. */
  winRate: number;
  byStage: StageBucketDto[];
}
