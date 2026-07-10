import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
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

export class UpdateAccountDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsIn(ACCOUNT_INDUSTRIES)
  @IsOptional()
  industry?: AccountIndustry;

  @IsUrl(
    { require_protocol: false },
    { message: 'website must be a valid URL' },
  )
  @IsOptional()
  @MaxLength(300)
  website?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  @Matches(/^\+?[0-9\s().-]{6,}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsIn(ACCOUNT_SIZES)
  @IsOptional()
  size?: AccountSize;

  @IsNumber()
  @Min(0)
  @IsOptional()
  annualRevenue?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsIn(ACCOUNT_STATUSES)
  @IsOptional()
  status?: AccountStatus;
}
