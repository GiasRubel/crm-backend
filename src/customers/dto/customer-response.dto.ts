export class CustomerResponseDto {
  id: string;
  keycloakId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company?: string;
  address?: string;
  notes?: string;
  status: 'active' | 'inactive' | 'prospect';
  createdBy: string;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  createdAt: string;
  updatedAt: string;
}
