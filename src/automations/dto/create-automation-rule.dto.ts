import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CRM_EVENTS } from '../../events/crm-event-bus.service';
import type { CrmEvent } from '../../events/crm-event-bus.service';
import {
  ACTION_TYPES,
  CONDITION_OPERATORS,
  EMAIL_RECIPIENTS,
  RULE_KINDS,
  SLA_ENTITIES,
} from '../automation-rule.schema';
import type {
  ActionType,
  ConditionOperator,
  EmailRecipient,
  RuleKind,
  SlaEntity,
} from '../automation-rule.schema';

export class RuleConditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  field: string;

  @IsIn(CONDITION_OPERATORS)
  operator: ConditionOperator;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  value: string;
}

export class RuleActionDto {
  @IsIn(ACTION_TYPES)
  type: ActionType;

  // create_task
  @IsString()
  @IsOptional()
  @MaxLength(200)
  taskSubject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  taskDescription?: string;

  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  @Type(() => Number)
  taskDueInDays?: number;

  @IsIn(['low', 'normal', 'high'])
  @IsOptional()
  taskPriority?: 'low' | 'normal' | 'high';

  // send_email
  @IsIn(EMAIL_RECIPIENTS)
  @IsOptional()
  emailTo?: EmailRecipient;

  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  emailAddress?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  emailSubject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  emailBody?: string;

  // assign_record
  @IsString()
  @IsOptional()
  assignToId?: string;

  @IsMongoId()
  @IsOptional()
  assignTeamId?: string;

  // call_webhook
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'webhookUrl must be a valid http(s) URL' },
  )
  @IsOptional()
  @MaxLength(1000)
  webhookUrl?: string;
}

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsIn(RULE_KINDS)
  kind: RuleKind;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  /** Required when kind = trigger (validated in the service). */
  @IsIn(CRM_EVENTS)
  @IsOptional()
  triggerEvent?: CrmEvent;

  /** Required when kind = sla (validated in the service). */
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
  actions: RuleActionDto[];
}
