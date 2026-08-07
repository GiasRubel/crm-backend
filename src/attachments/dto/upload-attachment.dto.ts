import { IsIn, IsMongoId } from 'class-validator';
import { ATTACHMENT_ENTITY_TYPES } from '../attachment.schema';
import type { AttachmentEntityType } from '../attachment.schema';

/** Non-file multipart fields sent alongside the upload. */
export class UploadAttachmentDto {
  @IsIn(ATTACHMENT_ENTITY_TYPES)
  entityType: AttachmentEntityType;

  @IsMongoId()
  entityId: string;
}
