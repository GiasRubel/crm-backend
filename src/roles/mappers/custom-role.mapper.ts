import { CustomRoleDocument } from '../custom-role.schema';
import { CustomRoleResponseDto } from '../dto/custom-role-response.dto';

export function toCustomRoleResponseDto(
  role: CustomRoleDocument,
  userCount = 0,
): CustomRoleResponseDto {
  return {
    id: role._id.toString(),
    name: role.name,
    description: role.description,
    permissions: role.permissions.map((p) => ({
      entityType: p.entityType,
      actions: p.actions,
      scope: p.scope,
    })),
    fieldRestrictions: role.fieldRestrictions.map((f) => ({
      entityType: f.entityType,
      fieldKey: f.fieldKey,
      hidden: f.hidden,
      readonly: f.readonly,
    })),
    userCount,
    createdAt: role.createdAt?.toISOString() ?? '',
    updatedAt: role.updatedAt?.toISOString() ?? '',
  };
}
