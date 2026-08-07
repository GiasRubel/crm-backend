import { IsIn, IsMongoId } from 'class-validator';
import { ATTACHMENT_ENTITY_TYPES } from '../attachment.schema';
import type { AttachmentEntityType } from '../attachment.schema';

export class AttachmentQueryDto {
  @IsIn(ATTACHMENT_ENTITY_TYPES)
  entityType: AttachmentEntityType;

  @IsMongoId()
  entityId: string;
}
