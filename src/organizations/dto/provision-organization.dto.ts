import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

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
}
