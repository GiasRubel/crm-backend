import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { actorFromJwt } from '../audit/audit.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { Types } from 'mongoose';
import { PermissionsService } from '../roles/permissions.service';
import { AppRole } from './app-role.enum';
import { CreateStaffDto } from './dto/create-staff.dto';
import { SetCustomRoleDto } from './dto/set-custom-role.dto';
import { StaffUserResponseDto } from './dto/staff-user-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: KeycloakJwtPayload): Promise<UserResponseDto> {
    return this.usersService.getOrProvisionMe(user);
  }

  /** The caller's effective CRUD/scope matrix — drives frontend UI gating. */
  @Get('me/permissions')
  getMyPermissions(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.permissionsService.getEffectiveMatrix(user.sub, organizationId);
  }

  /** Staff directory (non-Customer users) — used for team member/owner pickers. */
  @Get('staff')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStaff(): Promise<StaffUserResponseDto[]> {
    return this.usersService.findAllStaffWithRoleNames();
  }

  /** Admin-invited teammate — the only way to add staff besides the standalone first-login bootstrap. */
  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator)
  createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ): Promise<StaffUserResponseDto> {
    return this.usersService.createStaff(
      dto,
      actorFromJwt(user),
      organizationId,
    );
  }

  /** Assign or clear a User-tier staff member's custom role. */
  @Patch(':id/custom-role')
  @Roles(AppRole.Admin, AppRole.Administrator)
  setCustomRole(
    @Param('id') id: string,
    @Body() dto: SetCustomRoleDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.usersService.setCustomRole(
      id,
      dto.customRoleId ?? null,
      actorFromJwt(user),
      organizationId,
    );
  }
}
