import type { OrganizationStatus } from '../organization.schema';

export class OrganizationResponseDto {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
}
