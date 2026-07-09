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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamQueryDto } from './dto/team-query.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator)
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: KeycloakJwtPayload) {
    return this.teamsService.create(dto, user.sub);
  }

  /** All staff can read teams (needed to render assignments and their own team). */
  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(@Query() query: TeamQueryDto) {
    return this.teamsService.findAll(query);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats() {
    return this.teamsService.getStats();
  }

  /** Active teams the calling staff user is a member of. */
  @Get('my')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findMyTeams(@CurrentUser() user: KeycloakJwtPayload) {
    return this.teamsService.findMyTeams(user.sub);
  }

  /** Territory routing preview: which team would receive a record for this region? */
  @Get('match')
  @Roles(AppRole.Admin, AppRole.Administrator)
  matchRegion(@Query('region') region = '') {
    return this.teamsService.matchRegion(region);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.teamsService.remove(id);
  }
}
