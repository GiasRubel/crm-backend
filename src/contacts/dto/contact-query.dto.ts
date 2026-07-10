import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PREFERRED_CHANNELS } from '../contact.schema';
import type { PreferredChannel } from '../contact.schema';

export const CONTACT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'firstName',
  'lastName',
  'email',
  'jobTitle',
  'city',
  'country',
] as const;
export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];

export class ContactQueryDto {
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

  /** Restrict to one account's contacts (e.g. account detail view). */
  @IsMongoId()
  @IsOptional()
  accountId?: string;

  @IsIn(PREFERRED_CHANNELS)
  @IsOptional()
  preferredChannel?: PreferredChannel;

  /** "true"/"false" — filter by the do-not-contact flag. */
  @IsBooleanString()
  @IsOptional()
  doNotContact?: string;

  @IsIn(CONTACT_SORT_FIELDS)
  @IsOptional()
  sortBy?: ContactSortField = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
