import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { OPPORTUNITY_STAGES_OPEN } from '../../opportunities/opportunity.schema';
import type { OpportunityOpenStage } from '../../opportunities/opportunity.schema';

/**
 * Convert a qualified lead into a Customer (+ optionally an Opportunity).
 * The customer profile requires a phone number — supply one here when the
 * lead was captured without it.
 */
export class ConvertLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(30)
  @Matches(/^\+?[0-9\s().-]{6,}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  /** Set false to convert into a customer only (no deal yet). Default true. */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  createOpportunity?: boolean;

  /** Deal name; defaults to "<Company or full name> deal". */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  opportunityName?: string;

  /** Deal amount; defaults to the lead's estimatedValue (or 0). */
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  /** Initial pipeline stage; closed stages are not valid entry points. */
  @IsIn(OPPORTUNITY_STAGES_OPEN)
  @IsOptional()
  stage?: OpportunityOpenStage;
}
