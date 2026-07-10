import { ActivityDocument } from '../activity.schema';
import { ActivityResponseDto } from '../dto/activity-response.dto';

export interface ActivityLookupNames {
  /** keycloakId → staff display name */
  staffNames?: Map<string, string>;
  /** teamId → team name */
  teamNames?: Map<string, string>;
  /** `${relatedType}:${relatedId}` → linked record display name */
  relatedNames?: Map<string, string>;
}

export function relatedKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export function toActivityResponseDto(
  activity: ActivityDocument,
  names: ActivityLookupNames = {},
): ActivityResponseDto {
  const assignedTeamId = activity.assignedTeamId?.toString() ?? null;
  const relatedId = activity.relatedId?.toString() ?? null;
  const relatedType = activity.relatedType ?? null;

  return {
    id: activity._id.toString(),
    type: activity.type,
    subject: activity.subject,
    description: activity.description ?? null,
    status: activity.status,
    priority: activity.priority,
    direction: activity.direction ?? null,
    dueAt: activity.dueAt?.toISOString() ?? null,
    startAt: activity.startAt?.toISOString() ?? null,
    endAt: activity.endAt?.toISOString() ?? null,
    remindAt: activity.remindAt?.toISOString() ?? null,
    completedAt: activity.completedAt?.toISOString() ?? null,
    overdue:
      activity.status === 'pending' &&
      !!activity.dueAt &&
      activity.dueAt.getTime() < Date.now(),
    relatedType,
    relatedId,
    relatedName:
      (relatedType &&
        relatedId &&
        names.relatedNames?.get(relatedKey(relatedType, relatedId))) ||
      null,
    createdBy: activity.createdBy,
    createdByName: names.staffNames?.get(activity.createdBy) ?? null,
    assignedToId: activity.assignedToId,
    assignedToName: names.staffNames?.get(activity.assignedToId) ?? null,
    assignedTeamId,
    assignedTeamName:
      (assignedTeamId && names.teamNames?.get(assignedTeamId)) || null,
    createdAt: activity.createdAt?.toISOString() ?? '',
    updatedAt: activity.updatedAt?.toISOString() ?? '',
  };
}
