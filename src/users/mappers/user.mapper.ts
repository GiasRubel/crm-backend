import { UserDocument } from '../users.schema';
import { UserResponseDto } from '../dto/user-response.dto';

export function toUserResponseDto(user: UserDocument): UserResponseDto {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    role: user.role,
  };
}
