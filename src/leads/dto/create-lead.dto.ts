import {
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { LEAD_SOURCES } from '../lead.schema';
import type { LeadSource } from '../lead.schema';

/** Staff-side manual lead entry. For the public form/API, see CaptureLeadDto. */
export class CreateLeadDto {
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
  company?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsIn(LEAD_SOURCES)
  @IsOptional()
  source?: LeadSource;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedValue?: number;

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
