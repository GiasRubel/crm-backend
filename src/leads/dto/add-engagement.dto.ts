import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ENGAGEMENT_TYPES } from '../lead.schema';
import type { EngagementType } from '../lead.schema';

/** Log an engagement touchpoint on a lead; the score is recomputed. */
export class AddEngagementDto {
  @IsIn(ENGAGEMENT_TYPES)
  type: EngagementType;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;

  /**
   * Optional override of the default points for this engagement type
   * (e.g. an exceptionally productive call). Bounded to keep one event
   * from saturating or zeroing the whole score.
   */
  @IsInt()
  @Min(-50)
  @Max(50)
  @IsOptional()
  points?: number;
}
