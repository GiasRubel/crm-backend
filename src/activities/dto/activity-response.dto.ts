import type {
  ActivityDirection,
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  RelatedType,
} from '../activity.schema';

export class ActivityResponseDto {
  id: string;
  type: ActivityType;
  subject: string;
  description: string | null;
  status: ActivityStatus;
  priority: ActivityPriority;
  direction: ActivityDirection | null;
  dueAt: string | null;
  startAt: string | null;
  endAt: string | null;
  remindAt: string | null;
  completedAt: string | null;
  /** True when pending and dueAt is in the past. */
  overdue: boolean;
  relatedType: RelatedType | null;
  relatedId: string | null;
  /** Display name of the linked record (denormalized per page). */
  relatedName: string | null;
  createdBy: string;
  createdByName: string | null;
  assignedToId: string;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  createdAt: string;
  updatedAt: string;
}
