export class TeamStatsDto {
  total: number;
  active: number;
  inactive: number;
  /** Distinct staff users that belong to at least one team. */
  totalMembers: number;
  /** Customers currently routed to any team. */
  assignedCustomers: number;
}
