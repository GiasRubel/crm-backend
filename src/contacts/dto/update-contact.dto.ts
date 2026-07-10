import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PREFERRED_CHANNELS } from '../contact.schema';
import type { PreferredChannel } from '../contact.schema';

/** All fields optional; accountId/customerId additionally accept null to unlink. */
export class UpdateContactDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

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

  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  department?: string;

  @IsDateString()
  @IsOptional()
  birthday?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  language?: string;

  /** Account link: omitted = unchanged, null = unlink, id = validated & set. */
  @ValidateIf((o: UpdateContactDto) => o.accountId !== null)
  @IsString()
  @IsOptional()
  accountId?: string | null;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isPrimary?: boolean;

  /** Customer link: omitted = unchanged, null = unlink, id = validated & set. */
  @ValidateIf((o: UpdateContactDto) => o.customerId !== null)
  @IsString()
  @IsOptional()
  customerId?: string | null;

  @IsIn(PREFERRED_CHANNELS)
  @IsOptional()
  preferredChannel?: PreferredChannel;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  emailOptIn?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  phoneOptIn?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  smsOptIn?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  doNotContact?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
