import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { ActivitiesService } from './activities.service';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { AssignActivityDto } from './dto/assign-activity.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { SetActivityStatusDto } from './dto/set-activity-status.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.activitiesService.create(dto, user.sub);
  }

  /** Task list & unified timeline (filter by relatedType + relatedId). */
  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: ActivityQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.activitiesService.findAll(query, user.sub);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(@CurrentUser() user: KeycloakJwtPayload) {
    return this.activitiesService.getStats(user.sub);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.activitiesService.findOne(id, user.sub);
  }

  /** iCalendar export — importable into Outlook, Exchange, Google Calendar. */
  @Get(':id/ics')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="activity.ics"')
  getIcs(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.activitiesService.getIcs(id, user.sub);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.activitiesService.update(id, dto, user.sub);
  }

  /** Complete, reopen, or cancel. */
  @Patch(':id/status')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetActivityStatusDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.activitiesService.setStatus(id, dto, user.sub);
  }

  /** Reassign responsibility and/or team routing. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(@Param('id') id: string, @Body() dto: AssignActivityDto) {
    return this.activitiesService.assign(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(id);
  }
}
