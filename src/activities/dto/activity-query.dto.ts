import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  RELATED_TYPES,
} from '../activity.schema';
import type {
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  RelatedType,
} from '../activity.schema';

export const ACTIVITY_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'subject',
  'type',
  'status',
  'priority',
  'dueAt',
  'startAt',
] as const;
export type ActivitySortField = (typeof ACTIVITY_SORT_FIELDS)[number];

/** Convenience due-date windows for the task list / reminders feed. */
export const DUE_FILTERS = ['overdue', 'today', 'week'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export class ActivityQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @IsIn(ACTIVITY_TYPES)
  @IsOptional()
  type?: ActivityType;

  @IsIn(ACTIVITY_STATUSES)
  @IsOptional()
  status?: ActivityStatus;

  @IsIn(ACTIVITY_PRIORITIES)
  @IsOptional()
  priority?: ActivityPriority;

  /** Only open (pending) items in the given due window. */
  @IsIn(DUE_FILTERS)
  @IsOptional()
  due?: DueFilter;

  /** Restrict to one staff user's activities (e.g. "assigned to me"). */
  @IsString()
  @IsOptional()
  assignedToId?: string;

  /** Unified timeline: both must be provided together. */
  @IsIn(RELATED_TYPES)
  @IsOptional()
  relatedType?: RelatedType;

  @IsMongoId()
  @IsOptional()
  relatedId?: string;

  @IsIn(ACTIVITY_SORT_FIELDS)
  @IsOptional()
  sortBy?: ActivitySortField = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
