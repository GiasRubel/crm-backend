import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from './app-role.enum';
import { StaffUserResponseDto } from './dto/staff-user-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { toStaffUserResponseDto } from './mappers/user.mapper';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: KeycloakJwtPayload): Promise<UserResponseDto> {
    return this.usersService.getOrProvisionMe(user);
  }

  /** Staff directory (non-Customer users) — used for team member/owner pickers. */
  @Get('staff')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  async getStaff(): Promise<StaffUserResponseDto[]> {
    const staff = await this.usersService.findAllStaff();
    return staff.map(toStaffUserResponseDto);
  }
}
