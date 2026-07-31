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
import type { Types } from 'mongoose';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { AssignOpportunityDto } from './dto/assign-opportunity.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { OpportunityQueryDto } from './dto/opportunity-query.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateOpportunityDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.create(dto, user.sub, organizationId);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: OpportunityQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.findAll(query, user.sub, organizationId);
  }

  /** Kanban board: one column per pipeline stage, with value totals. */
  @Get('board')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getBoard(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.getBoard(user.sub, organizationId);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.getStats(user.sub, organizationId);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.findOne(id, user.sub, organizationId);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.update(id, dto, user.sub, organizationId);
  }

  /** Pipeline move (Kanban drag / stage action). */
  @Patch(':id/stage')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  moveStage(
    @Param('id') id: string,
    @Body() dto: MoveStageDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.moveStage(
      id,
      dto,
      user.sub,
      organizationId,
    );
  }

  /** Record routing: set/clear the record owner and/or the assigned team. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignOpportunityDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.assign(id, dto, organizationId);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.opportunitiesService.remove(id, organizationId);
  }
}
