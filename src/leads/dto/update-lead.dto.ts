import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { LEAD_SOURCES } from '../lead.schema';
import type { LeadSource, LeadStatus } from '../lead.schema';

/**
 * Staff-editable lead fields. `status` here covers the qualification
 * workflow (new/contacted/qualified/unqualified); `converted` is set
 * exclusively by the convert endpoint and is rejected by the service.
 */
export class UpdateLeadDto {
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

  @IsIn(['new', 'contacted', 'qualified', 'unqualified'])
  @IsOptional()
  status?: Exclude<LeadStatus, 'converted'>;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedValue?: number;
}
