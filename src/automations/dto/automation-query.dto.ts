import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { RULE_KINDS } from '../automation-rule.schema';
import type { RuleKind } from '../automation-rule.schema';
import { RUN_STATUSES } from '../automation-run.schema';
import type { RunStatus } from '../automation-run.schema';

export class RuleQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;

  @IsIn(RULE_KINDS)
  @IsOptional()
  kind?: RuleKind;

  /** "true"/"false" */
  @IsBooleanString()
  @IsOptional()
  isActive?: string;
}

export class RunQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;

  @IsMongoId()
  @IsOptional()
  ruleId?: string;

  @IsIn(RUN_STATUSES)
  @IsOptional()
  status?: RunStatus;
}
