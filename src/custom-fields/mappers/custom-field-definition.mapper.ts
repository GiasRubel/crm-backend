import { CustomFieldDefinitionResponseDto } from '../dto/custom-field-definition-response.dto';
import { CustomFieldDocument } from '../custom-field-definition.schema';

export function toCustomFieldDefinitionResponseDto(
  doc: CustomFieldDocument,
): CustomFieldDefinitionResponseDto {
  return {
    id: doc._id.toString(),
    entityType: doc.entityType,
    key: doc.key,
    label: doc.label,
    type: doc.type,
    options: doc.options,
    required: doc.required,
    isActive: doc.isActive,
    order: doc.order,
    helpText: doc.helpText,
    createdAt: doc.createdAt?.toISOString() ?? '',
    updatedAt: doc.updatedAt?.toISOString() ?? '',
  };
}
