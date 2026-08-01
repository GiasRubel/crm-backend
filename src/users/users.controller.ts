import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { Types } from 'mongoose';
import { AppRole } from './app-role.enum';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffUserResponseDto } from './dto/staff-user-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { toStaffUserResponseDto } from './mappers/user.mapper';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
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

  /** Admin-invited teammate — the only way to add staff besides the standalone first-login bootstrap. */
  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator)
  createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ): Promise<StaffUserResponseDto> {
    return this.usersService.createStaff(dto, organizationId);
  }
}
