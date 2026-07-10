export class ActivityStatsDto {
  /** Pending tasks (type=task, status=pending). */
  openTasks: number;
  /** Pending items with dueAt in the past. */
  overdue: number;
  /** Pending items due today. */
  dueToday: number;
  /** Pending items with a reminder timestamp that has passed. */
  remindersDue: number;
  /** Meetings scheduled to start within the next 7 days. */
  upcomingMeetings: number;
  /** Items completed this month. */
  completedThisMonth: number;
}
