import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ORGANIZATION_AUTH_PROVIDERS } from '../organization.schema';
import type { OrganizationAuthProvider } from '../organization.schema';

export class ProvisionOrganizationDto {
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

  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  adminFirstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  adminLastName: string;

  @IsString()
  @IsOptional()
  planId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  trialDays?: number;

  /** Identity provider for this org's users. Defaults to 'keycloak' if omitted. */
  @IsIn(ORGANIZATION_AUTH_PROVIDERS)
  @IsOptional()
  authProvider?: OrganizationAuthProvider;
}
