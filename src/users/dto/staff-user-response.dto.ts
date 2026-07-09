import { AppRole } from '../app-role.enum';

export class StaffUserResponseDto {
  id: string;
  keycloakId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
}
