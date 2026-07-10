export class LeadStatsDto {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  unqualified: number;
  converted: number;
  /** Open leads with score ≥ 70. */
  hot: number;
  newThisMonth: number;
  convertedThisMonth: number;
  /** converted / (converted + unqualified + open), rounded percent, all-time. */
  conversionRate: number;
  /** Mean score across open leads. */
  averageScore: number;
}
