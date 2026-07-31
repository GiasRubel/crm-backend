import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ORGANIZATION_STATUSES } from '../organization.schema';
import type { OrganizationStatus } from '../organization.schema';

export class UpdateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsIn(ORGANIZATION_STATUSES)
  @IsOptional()
  status?: OrganizationStatus;
}
