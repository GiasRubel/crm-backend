import { AttachmentDocument } from '../attachment.schema';
import { AttachmentResponseDto } from '../dto/attachment-response.dto';

export function toAttachmentResponseDto(
  attachment: AttachmentDocument,
  uploaderNames: Map<string, string>,
): AttachmentResponseDto {
  return {
    id: attachment._id.toString(),
    entityType: attachment.entityType,
    entityId: attachment.entityId.toString(),
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedBy: attachment.uploadedBy,
    uploadedByName: uploaderNames.get(attachment.uploadedBy) ?? null,
    createdAt: attachment.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
