import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ACTIVITY_DIRECTIONS,
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  RELATED_TYPES,
} from '../activity.schema';
import type {
  ActivityDirection,
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  RelatedType,
} from '../activity.schema';

export class CreateActivityDto {
  @IsIn(ACTIVITY_TYPES)
  type: ActivityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  description?: string;

  /**
   * Optional; the service defaults it — communications logged after the
   * fact default to `completed`, tasks and scheduled items to `pending`.
   */
  @IsIn(ACTIVITY_STATUSES)
  @IsOptional()
  status?: ActivityStatus;

  @IsIn(ACTIVITY_PRIORITIES)
  @IsOptional()
  priority?: ActivityPriority;

  @IsIn(ACTIVITY_DIRECTIONS)
  @IsOptional()
  direction?: ActivityDirection;

  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsDateString()
  @IsOptional()
  remindAt?: string;

  /** Both relatedType and relatedId must be provided together. */
  @IsIn(RELATED_TYPES)
  @IsOptional()
  relatedType?: RelatedType;

  @IsMongoId()
  @IsOptional()
  relatedId?: string;

  /**
   * Explicit assignee (keycloakId). Omitted → automated assignment: the
   * linked record's owner, else the creator.
   */
  @IsString()
  @IsOptional()
  assignedToId?: string;

  /** Optional team routing; omitted → inherited from the linked record. */
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string;
}
