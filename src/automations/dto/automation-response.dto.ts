import type { CrmEvent } from '../../events/crm-event-bus.service';
import type {
  ActionType,
  ConditionOperator,
  EmailRecipient,
  RuleKind,
  SlaEntity,
} from '../automation-rule.schema';
import type { RunStatus } from '../automation-run.schema';

export class RuleConditionResponseDto {
  field: string;
  operator: ConditionOperator;
  value: string;
}

export class RuleActionResponseDto {
  type: ActionType;
  taskSubject?: string;
  taskDescription?: string;
  taskDueInDays?: number;
  taskPriority?: 'low' | 'normal' | 'high';
  emailTo?: EmailRecipient;
  emailAddress?: string;
  emailSubject?: string;
  emailBody?: string;
  assignToId?: string;
  assignTeamId?: string;
  webhookUrl?: string;
}

export class AutomationRuleResponseDto {
  id: string;
  name: string;
  description: string | null;
  kind: RuleKind;
  isActive: boolean;
  triggerEvent: CrmEvent | null;
  slaEntity: SlaEntity | null;
  slaIdleHours: number | null;
  conditions: RuleConditionResponseDto[];
  actions: RuleActionResponseDto[];
  createdBy: string;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export class AutomationRunResponseDto {
  id: string;
  ruleId: string;
  ruleName: string;
  event: string;
  recordType: string;
  recordId: string;
  recordName: string | null;
  status: RunStatus;
  logs: string[];
  createdAt: string;
}

export class AutomationStatsDto {
  totalRules: number;
  activeRules: number;
  triggerRules: number;
  slaRules: number;
  runsLast24h: number;
  failedRunsLast24h: number;
}
