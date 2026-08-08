import { ArrayMaxSize, IsArray, IsIn, IsString } from 'class-validator';
import {
  PERMISSION_ACTIONS,
  PERMISSION_ENTITY_TYPES,
  PERMISSION_SCOPES,
} from '../custom-role.schema';
import type {
  PermissionAction,
  PermissionEntityType,
  PermissionScope,
} from '../custom-role.schema';

export class EntityPermissionDto {
  @IsString()
  @IsIn(PERMISSION_ENTITY_TYPES)
  entityType: PermissionEntityType;

  @IsArray()
  @ArrayMaxSize(PERMISSION_ACTIONS.length)
  @IsIn(PERMISSION_ACTIONS, { each: true })
  actions: PermissionAction[];

  @IsString()
  @IsIn(PERMISSION_SCOPES)
  scope: PermissionScope;
}
