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
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from '../ticket.schema';
import type {
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../ticket.schema';

export const TICKET_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'number',
  'subject',
  'status',
  'priority',
  'type',
] as const;
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];

export class TicketQueryDto {
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

  /** Matches number, subject, and description. */
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @IsIn(TICKET_STATUSES)
  @IsOptional()
  status?: TicketStatus;

  /** Convenience: all non-closed statuses at once. */
  @IsIn(['true'])
  @IsOptional()
  openOnly?: string;

  @IsIn(TICKET_TYPES)
  @IsOptional()
  type?: TicketType;

  @IsIn(TICKET_PRIORITIES)
  @IsOptional()
  priority?: TicketPriority;

  @IsMongoId()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  assignedToId?: string;

  /** "true" — tickets without an owner (triage queue). */
  @IsIn(['true'])
  @IsOptional()
  unassigned?: string;

  @IsIn(TICKET_SORT_FIELDS)
  @IsOptional()
  sortBy?: TicketSortField = 'updatedAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
