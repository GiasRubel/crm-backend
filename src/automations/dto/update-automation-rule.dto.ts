import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CRM_EVENTS } from '../../events/crm-event-bus.service';
import type { CrmEvent } from '../../events/crm-event-bus.service';
import { SLA_ENTITIES } from '../automation-rule.schema';
import type { SlaEntity } from '../automation-rule.schema';
import { RuleActionDto, RuleConditionDto } from './create-automation-rule.dto';

/** Kind is immutable; everything else is editable. */
export class UpdateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsIn(CRM_EVENTS)
  @IsOptional()
  triggerEvent?: CrmEvent;

  @IsIn(SLA_ENTITIES)
  @IsOptional()
  slaEntity?: SlaEntity;

  @IsInt()
  @Min(1)
  @Max(24 * 90)
  @IsOptional()
  @Type(() => Number)
  slaIdleHours?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @ArrayMaxSize(10)
  @IsOptional()
  conditions?: RuleConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsOptional()
  actions?: RuleActionDto[];
}
