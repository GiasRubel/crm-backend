import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type {
  CustomFieldEntityType,
  CustomFieldType,
} from '../custom-field-definition.schema';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
} from '../custom-field-definition.schema';

export class CreateCustomFieldDefinitionDto {
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType: CustomFieldEntityType;

  /** Machine key: lowercase letters, digits, underscore; must start with a letter. */
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,49}$/, {
    message:
      'key must start with a lowercase letter and contain only lowercase letters, digits, or underscores (max 50 chars)',
  })
  key: string;

  @IsString()
  @MaxLength(80)
  label: string;

  @IsIn(CUSTOM_FIELD_TYPES)
  type: CustomFieldType;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  @IsOptional()
  options?: string[];

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  helpText?: string;
}
