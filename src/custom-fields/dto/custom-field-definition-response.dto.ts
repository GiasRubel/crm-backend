import type {
  CustomFieldEntityType,
  CustomFieldType,
} from '../custom-field-definition.schema';

export class CustomFieldDefinitionResponseDto {
  id: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  isActive: boolean;
  order: number;
  helpText?: string;
  createdAt: string;
  updatedAt: string;
}
