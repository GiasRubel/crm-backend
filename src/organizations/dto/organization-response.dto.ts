import type {
  OrganizationAuthProvider,
  OrganizationStatus,
} from '../organization.schema';

export class OrganizationResponseDto {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  authProvider: OrganizationAuthProvider;
  createdAt: string;
  updatedAt: string;
}
