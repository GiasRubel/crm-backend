import {
  PermissionAction,
  PermissionEntityType,
  PermissionScope,
} from '../custom-role.schema';

export class EntityPermissionResponseDto {
  entityType: PermissionEntityType;
  actions: PermissionAction[];
  scope: PermissionScope;
}

export class FieldRestrictionResponseDto {
  entityType: PermissionEntityType;
  fieldKey: string;
  hidden: boolean;
  readonly: boolean;
}

export class CustomRoleResponseDto {
  id: string;
  name: string;
  description?: string;
  permissions: EntityPermissionResponseDto[];
  fieldRestrictions: FieldRestrictionResponseDto[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}
