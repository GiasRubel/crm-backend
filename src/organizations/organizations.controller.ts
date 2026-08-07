import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { actorFromJwt } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ProvisionOrganizationDto } from './dto/provision-organization.dto';
import { OrganizationsService } from './organizations.service';

/** Cross-org management — only the platform owner provisions organizations. */
@ApiTags('organizations')
@ApiBearerAuth('access-token')
@Controller('organizations')
@Roles(AppRole.PlatformAdmin)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('provision')
  provision(
    @Body() dto: ProvisionOrganizationDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.organizationsService.provision(dto, actorFromJwt(user));
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get()
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.organizationsService.update(id, dto, actorFromJwt(user));
  }
}
