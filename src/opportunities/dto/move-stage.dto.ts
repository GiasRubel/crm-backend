import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OPPORTUNITY_STAGES } from '../opportunity.schema';
import type { OpportunityStage } from '../opportunity.schema';

/** Move a deal to another pipeline stage (Kanban drag or explicit action). */
export class MoveStageDto {
  @IsIn(OPPORTUNITY_STAGES)
  stage: OpportunityStage;

  /** Why the deal was lost — required when moving to closed_lost. */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  lostReason?: string;
}
