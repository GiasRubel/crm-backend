import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ORGANIZATION_AUTH_PROVIDERS,
  ORGANIZATION_STATUSES,
} from '../organization.schema';
import type {
  OrganizationAuthProvider,
  OrganizationStatus,
} from '../organization.schema';

export class UpdateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsIn(ORGANIZATION_STATUSES)
  @IsOptional()
  status?: OrganizationStatus;

  @IsIn(ORGANIZATION_AUTH_PROVIDERS)
  @IsOptional()
  authProvider?: OrganizationAuthProvider;
}
