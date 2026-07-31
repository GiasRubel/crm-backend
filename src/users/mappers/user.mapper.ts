import { UserDocument } from '../users.schema';
import { StaffUserResponseDto } from '../dto/staff-user-response.dto';
import { UserResponseDto } from '../dto/user-response.dto';

export function toUserResponseDto(user: UserDocument): UserResponseDto {
  return {
    id: user._id.toString(),
    keycloakId: user.keycloakId,
    email: user.email,
    username: user.username ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    role: user.role,
  };
}

export function toStaffUserResponseDto(
  user: UserDocument,
): StaffUserResponseDto {
  return {
    id: user._id.toString(),
    keycloakId: user.keycloakId,
    email: user.email,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    role: user.role,
  };
}
