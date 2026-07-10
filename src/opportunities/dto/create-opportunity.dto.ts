import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OPPORTUNITY_STAGES_OPEN } from '../opportunity.schema';
import type { OpportunityOpenStage } from '../opportunity.schema';

export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  /** The customer this deal is with (must exist). */
  @IsMongoId()
  @IsNotEmpty()
  customerId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  /** Deals enter the pipeline in an open stage; closing is a stage *move*. */
  @IsIn(OPPORTUNITY_STAGES_OPEN)
  @IsOptional()
  stage?: OpportunityOpenStage;

  /** Override the stage's default win probability. */
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  probability?: number;

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

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

  /** Origin lead — set by the lead-conversion flow. */
  @IsMongoId()
  @IsOptional()
  leadId?: string;

  /** B2B company (Account) this deal belongs to. */
  @IsMongoId()
  @IsOptional()
  accountId?: string;
}
