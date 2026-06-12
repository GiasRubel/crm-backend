import { AppRole } from '../app-role.enum';

export class UserResponseDto {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: AppRole;
}
