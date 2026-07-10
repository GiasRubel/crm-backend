import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LEAD_SOURCES, LEAD_STATUSES } from '../lead.schema';
import type { LeadSource, LeadStatus } from '../lead.schema';

export const LEAD_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'firstName',
  'lastName',
  'email',
  'company',
  'status',
  'score',
  'estimatedValue',
] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export const LEAD_RATINGS = ['hot', 'warm', 'cold'] as const;
export type LeadRating = (typeof LEAD_RATINGS)[number];

export class LeadQueryDto {
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

  @IsIn(LEAD_STATUSES)
  @IsOptional()
  status?: LeadStatus;

  @IsIn(LEAD_SOURCES)
  @IsOptional()
  source?: LeadSource;

  /** Temperature filter derived from score thresholds (hot/warm/cold). */
  @IsIn(LEAD_RATINGS)
  @IsOptional()
  rating?: LeadRating;

  @IsIn(LEAD_SORT_FIELDS)
  @IsOptional()
  sortBy?: LeadSortField = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
