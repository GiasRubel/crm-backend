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
import { AutomationsService } from './automations.service';
import { RuleQueryDto, RunQueryDto } from './dto/automation-query.dto';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

/** Rule engine configuration is admin-only end to end. */
@ApiTags('automations')
@ApiBearerAuth('access-token')
@Controller('automations')
@Roles(AppRole.Admin, AppRole.Administrator)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Post()
  create(
    @Body() dto: CreateAutomationRuleDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.automationsService.create(dto, user.sub, organizationId);
  }

  @Get()
  findAll(
    @Query() query: RuleQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.automationsService.findAll(query, organizationId);
  }

  @Get('stats')
  getStats(@CurrentOrg() organizationId: Types.ObjectId) {
    return this.automationsService.getStats(organizationId);
  }

  /** Execution log (filter by ruleId / status). */
  @Get('runs')
  findRuns(
    @Query() query: RunQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.automationsService.findRuns(query, organizationId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.automationsService.findOne(id, organizationId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.automationsService.update(
      id,
      dto,
      actorFromJwt(user),
      organizationId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.automationsService.remove(
      id,
      actorFromJwt(user),
      organizationId,
    );
  }
}
