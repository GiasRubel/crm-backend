import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EntityPermissionDto } from './entity-permission.dto';
import { FieldRestrictionDto } from './field-restriction.dto';

export class CreateCustomRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EntityPermissionDto)
  permissions?: EntityPermissionDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FieldRestrictionDto)
  fieldRestrictions?: FieldRestrictionDto[];
}
