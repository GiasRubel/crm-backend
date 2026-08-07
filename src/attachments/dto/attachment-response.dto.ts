import { AttachmentEntityType } from '../attachment.schema';

export class AttachmentResponseDto {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
}
