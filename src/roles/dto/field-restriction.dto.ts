import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PERMISSION_ENTITY_TYPES } from '../custom-role.schema';
import type { PermissionEntityType } from '../custom-role.schema';

export class FieldRestrictionDto {
  @IsString()
  @IsIn(PERMISSION_ENTITY_TYPES)
  entityType: PermissionEntityType;

  @IsString()
  @MaxLength(100)
  fieldKey: string;

  @IsBoolean()
  @IsOptional()
  hidden?: boolean;

  @IsBoolean()
  @IsOptional()
  readonly?: boolean;
}
