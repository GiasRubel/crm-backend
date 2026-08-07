import { AuditFieldChange } from '../audit-log.schema';

export class AuditLogResponseDto {
  id: string;
  organizationId: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  summary: string;
  changes: AuditFieldChange[];
  before?: object | null;
  after?: object | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
