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
import { OPPORTUNITY_STAGES } from '../opportunity.schema';
import type { OpportunityStage } from '../opportunity.schema';

export const OPPORTUNITY_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'amount',
  'stage',
  'probability',
  'expectedCloseDate',
] as const;
export type OpportunitySortField = (typeof OPPORTUNITY_SORT_FIELDS)[number];

export class OpportunityQueryDto {
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

  @IsIn(OPPORTUNITY_STAGES)
  @IsOptional()
  stage?: OpportunityStage;

  /** Restrict to one customer's deals (e.g. a customer detail view). */
  @IsMongoId()
  @IsOptional()
  customerId?: string;

  /** Restrict to one account's deals (e.g. the 360° account view). */
  @IsMongoId()
  @IsOptional()
  accountId?: string;

  @IsIn(OPPORTUNITY_SORT_FIELDS)
  @IsOptional()
  sortBy?: OpportunitySortField = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
