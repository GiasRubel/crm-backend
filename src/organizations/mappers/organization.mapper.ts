import { OrganizationDocument } from '../organization.schema';
import { OrganizationResponseDto } from '../dto/organization-response.dto';

export function toOrganizationResponseDto(
  organization: OrganizationDocument,
): OrganizationResponseDto {
  return {
    id: organization._id.toString(),
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    authProvider: organization.authProvider,
    createdAt: organization.createdAt?.toISOString() ?? '',
    updatedAt: organization.updatedAt?.toISOString() ?? '',
  };
}
