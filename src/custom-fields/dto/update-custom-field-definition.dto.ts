import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { CustomFieldType } from '../custom-field-definition.schema';
import { CUSTOM_FIELD_TYPES } from '../custom-field-definition.schema';

/**
 * `entityType` and `key` are immutable after creation — changing either
 * would orphan values already stored under the old key. Delete and
 * recreate the definition instead.
 */
export class UpdateCustomFieldDefinitionDto {
  @IsString()
  @IsOptional()
  @MaxLength(80)
  label?: string;

  @IsIn(CUSTOM_FIELD_TYPES)
  @IsOptional()
  type?: CustomFieldType;

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
