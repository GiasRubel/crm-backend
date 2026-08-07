import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PREFERRED_CHANNELS } from '../contact.schema';
import type { PreferredChannel } from '../contact.schema';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

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

  // ── Demographics ────────────────────────────────────────────────────────
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

  // ── Links ───────────────────────────────────────────────────────────────
  /** Company (Account) this person belongs to. */
  @IsMongoId()
  @IsOptional()
  accountId?: string;

  /** Mark as the account's primary contact (requires accountId). */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isPrimary?: boolean;

  /** Link to an existing Customer record (portal identity), if any. */
  @IsMongoId()
  @IsOptional()
  customerId?: string;

  // ── Preferences ─────────────────────────────────────────────────────────
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

  /** Optional initial record owner (keycloakId of a staff user). */
  @IsString()
  @IsOptional()
  assignedToId?: string;

  /** Optional initial team routing (team id). */
  @IsMongoId()
  @IsOptional()
  assignedTeamId?: string;

  /** Admin-defined field values, keyed by CustomFieldDefinition.key. */
  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;
}
