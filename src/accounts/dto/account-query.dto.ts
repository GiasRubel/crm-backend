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
import {
  ACCOUNT_INDUSTRIES,
  ACCOUNT_SIZES,
  ACCOUNT_STATUSES,
} from '../account.schema';
import type {
  AccountIndustry,
  AccountSize,
  AccountStatus,
} from '../account.schema';

export const ACCOUNT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'industry',
  'status',
  'annualRevenue',
] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

export class AccountQueryDto {
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

  @IsIn(ACCOUNT_INDUSTRIES)
  @IsOptional()
  industry?: AccountIndustry;

  @IsIn(ACCOUNT_SIZES)
  @IsOptional()
  size?: AccountSize;

  @IsIn(ACCOUNT_STATUSES)
  @IsOptional()
  status?: AccountStatus;

  @IsIn(ACCOUNT_SORT_FIELDS)
  @IsOptional()
  sortBy?: AccountSortField = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
