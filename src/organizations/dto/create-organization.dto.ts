import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ORGANIZATION_STATUSES } from '../organization.schema';
import type { OrganizationStatus } from '../organization.schema';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsIn(ORGANIZATION_STATUSES)
  @IsOptional()
  status?: OrganizationStatus;
}
