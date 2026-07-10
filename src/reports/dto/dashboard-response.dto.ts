import { OpportunityStage } from '../../opportunities/opportunity.schema';

export class DashboardStageBucketDto {
  stage: OpportunityStage;
  count: number;
  totalAmount: number;
  weightedAmount: number;
}

export class DashboardPipelineDto {
  openCount: number;
  openValue: number;
  weightedValue: number;
  wonThisMonthCount: number;
  wonThisMonthValue: number;
  /** closed_won / (closed_won + closed_lost), all-time, rounded percent. */
  winRate: number;
  byStage: DashboardStageBucketDto[];
}

export class DashboardFunnelDto {
  totalLeads: number;
  new: number;
  contacted: number;
  qualified: number;
  unqualified: number;
  converted: number;
  /** converted / (converted + unqualified + open), rounded percent. */
  conversionRate: number;
}

export class RevenuePointDto {
  /** `YYYY-MM`. */
  month: string;
  wonValue: number;
  wonCount: number;
}

export class BreakdownSliceDto {
  key: string;
  label: string;
  count: number;
}

export class RepPerformanceDto {
  ownerId: string;
  ownerName: string;
  wonCount: number;
  wonValue: number;
  openCount: number;
  openValue: number;
  /** wonCount / (wonCount + lostCount), rounded percent. */
  winRate: number;
}

export class DashboardTotalsDto {
  customers: number;
  activeCustomers: number;
  openTickets: number;
  pendingTasks: number;
  overdueTasks: number;
}

export class DashboardResponseDto {
  totals: DashboardTotalsDto;
  pipeline: DashboardPipelineDto;
  funnel: DashboardFunnelDto;
  /** Trailing 12 months of won revenue (oldest → newest). */
  revenueByMonth: RevenuePointDto[];
  leadsBySource: BreakdownSliceDto[];
  /** Top reps by won value within the caller's visibility. */
  topReps: RepPerformanceDto[];
}
