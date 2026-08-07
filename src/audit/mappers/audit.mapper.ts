import { AuditLogDocument } from '../audit-log.schema';
import { AuditLogResponseDto } from '../dto/audit-log-response.dto';

/** Denormalize the actor's current display name when it wasn't captured at write time. */
export function toAuditLogResponseDto(
  doc: AuditLogDocument,
  staffNames: Map<string, string>,
): AuditLogResponseDto {
  const fallbackName = doc.actorId?.startsWith('system:')
    ? 'System'
    : doc.actorId
      ? staffNames.get(doc.actorId)
      : undefined;

  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    actorId: doc.actorId,
    actorName: doc.actorName || fallbackName,
    actorEmail: doc.actorEmail,
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId,
    entityLabel: doc.entityLabel,
    summary: doc.summary,
    changes: doc.changes ?? [],
    before: doc.before ?? undefined,
    after: doc.after ?? undefined,
    metadata: doc.metadata,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}
