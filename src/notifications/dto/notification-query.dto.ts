import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class NotificationQueryDto {
  /** "true"/"false" — restrict the list to unread notifications only. */
  @IsBooleanString()
  @IsOptional()
  unreadOnly?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
