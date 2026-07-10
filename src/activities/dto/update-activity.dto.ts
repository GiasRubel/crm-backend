import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ACTIVITY_DIRECTIONS, ACTIVITY_PRIORITIES } from '../activity.schema';
import type { ActivityDirection, ActivityPriority } from '../activity.schema';

/**
 * Editable fields. Type and the related-record link are immutable after
 * creation (log a new activity instead); status changes go through
 * PATCH /activities/:id/status so completedAt stays consistent.
 * Date fields accept null to clear.
 */
export class UpdateActivityDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  description?: string;

  @IsIn(ACTIVITY_PRIORITIES)
  @IsOptional()
  priority?: ActivityPriority;

  @IsIn(ACTIVITY_DIRECTIONS)
  @IsOptional()
  direction?: ActivityDirection;

  @ValidateIf((o: UpdateActivityDto) => o.dueAt !== null)
  @IsDateString()
  @IsOptional()
  dueAt?: string | null;

  @ValidateIf((o: UpdateActivityDto) => o.startAt !== null)
  @IsDateString()
  @IsOptional()
  startAt?: string | null;

  @ValidateIf((o: UpdateActivityDto) => o.endAt !== null)
  @IsDateString()
  @IsOptional()
  endAt?: string | null;

  @ValidateIf((o: UpdateActivityDto) => o.remindAt !== null)
  @IsDateString()
  @IsOptional()
  remindAt?: string | null;
}
