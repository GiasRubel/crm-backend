import { AppRole } from '../../users/app-role.enum';

export class TeamMemberDto {
  keycloakId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
}

export class TeamResponseDto {
  id: string;
  name: string;
  description?: string;
  regions: string[];
  leaderId?: string | null;
  members: TeamMemberDto[];
  isActive: boolean;
  /** Number of customers currently routed to this team. */
  customerCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
