import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { KB_STATUSES, KB_VISIBILITIES } from '../kb-article.schema';
import type { KbStatus, KbVisibility } from '../kb-article.schema';

export const KB_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'category',
  'status',
  'views',
] as const;
export type KbSortField = (typeof KB_SORT_FIELDS)[number];

export class KbQueryDto {
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

  @IsString()
  @MaxLength(50)
  @IsOptional()
  category?: string;

  @IsIn(KB_STATUSES)
  @IsOptional()
  status?: KbStatus;

  @IsIn(KB_VISIBILITIES)
  @IsOptional()
  visibility?: KbVisibility;

  @IsIn(KB_SORT_FIELDS)
  @IsOptional()
  sortBy?: KbSortField = 'updatedAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/** Public FAQ browsing (unauthenticated) — search + category only. */
export class PublicKbQueryDto {
  /**
   * Which organisation's FAQ to read. Required: without it these endpoints
   * return every tenant's public articles to every anonymous caller. Mirrors
   * CaptureLeadDto.organizationSlug, the other unauthenticated entry point.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationSlug: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  category?: string;
}

/** Body of an anonymous "was this helpful?" vote — see KbFeedbackDto for the rest. */
export class PublicKbOrgDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationSlug: string;
}
