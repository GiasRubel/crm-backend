import { AutomationRuleDocument } from '../automation-rule.schema';
import { AutomationRunDocument } from '../automation-run.schema';
import {
  AutomationRuleResponseDto,
  AutomationRunResponseDto,
} from '../dto/automation-response.dto';

export function toRuleResponseDto(
  rule: AutomationRuleDocument,
): AutomationRuleResponseDto {
  return {
    id: rule._id.toString(),
    name: rule.name,
    description: rule.description ?? null,
    kind: rule.kind,
    isActive: rule.isActive,
    triggerEvent: rule.triggerEvent ?? null,
    slaEntity: rule.slaEntity ?? null,
    slaIdleHours: rule.slaIdleHours ?? null,
    conditions: rule.conditions.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.value,
    })),
    actions: rule.actions.map((a) => ({
      type: a.type,
      taskSubject: a.taskSubject,
      taskDescription: a.taskDescription,
      taskDueInDays: a.taskDueInDays,
      taskPriority: a.taskPriority,
      emailTo: a.emailTo,
      emailAddress: a.emailAddress,
      emailSubject: a.emailSubject,
      emailBody: a.emailBody,
      assignToId: a.assignToId,
      assignTeamId: a.assignTeamId?.toString(),
      webhookUrl: a.webhookUrl,
    })),
    createdBy: rule.createdBy,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    runCount: rule.runCount,
    createdAt: rule.createdAt?.toISOString() ?? '',
    updatedAt: rule.updatedAt?.toISOString() ?? '',
  };
}

export function toRunResponseDto(
  run: AutomationRunDocument,
): AutomationRunResponseDto {
  return {
    id: run._id.toString(),
    ruleId: run.ruleId.toString(),
    ruleName: run.ruleName,
    event: run.event,
    recordType: run.recordType,
    recordId: run.recordId.toString(),
    recordName: run.recordName ?? null,
    status: run.status,
    logs: run.logs,
    createdAt: run.createdAt?.toISOString() ?? '',
  };
}
