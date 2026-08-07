import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { actorFromJwt } from '../audit/audit.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDefinitionDto } from './dto/create-custom-field-definition.dto';
import { CustomFieldDefinitionQueryDto } from './dto/custom-field-definition-query.dto';
import { UpdateCustomFieldDefinitionDto } from './dto/update-custom-field-definition.dto';

/**
 * Admin-configurable field definitions for the core entities. Reads are
 * open to any staff role (entity forms need them to render); writes are
 * Admin/Administrator only.
 */
@ApiTags('custom-fields')
@ApiBearerAuth('access-token')
@Controller('custom-field-definitions')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator)
  create(
    @Body() dto: CreateCustomFieldDefinitionDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.customFieldsService.create(
      dto,
      actorFromJwt(user),
      organizationId,
    );
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: CustomFieldDefinitionQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.customFieldsService.findAll(query, organizationId);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDefinitionDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.customFieldsService.update(
      id,
      dto,
      actorFromJwt(user),
      organizationId,
    );
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.customFieldsService.remove(
      id,
      actorFromJwt(user),
      organizationId,
    );
  }
}
