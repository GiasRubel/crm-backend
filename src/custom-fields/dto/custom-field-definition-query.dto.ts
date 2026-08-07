import { IsBooleanString, IsIn, IsOptional } from 'class-validator';
import type { CustomFieldEntityType } from '../custom-field-definition.schema';
import { CUSTOM_FIELD_ENTITY_TYPES } from '../custom-field-definition.schema';

export class CustomFieldDefinitionQueryDto {
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  @IsOptional()
  entityType?: CustomFieldEntityType;

  /** Defaults to returning active + inactive; pass 'true' to filter to active only. */
  @IsBooleanString()
  @IsOptional()
  activeOnly?: string;
}
