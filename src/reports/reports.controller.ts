import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { CreateSavedReportDto } from './dto/create-saved-report.dto';
import { RunReportDto } from './dto/run-report.dto';
import { RunSavedReportDto } from './dto/run-saved-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ── Metadata + dashboards ──────────────────────────────────────────────────

  /** Dataset/field/operator registry that drives the report builder UI. */
  @Get('datasets')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getDatasets() {
    return this.reportsService.getDatasets();
  }

  /** Consolidated analytics overview (pipeline, funnel, revenue, reps). */
  @Get('dashboard')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getDashboard(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.getDashboard(user.sub, organizationId);
  }

  /** Rep leaderboard + per-team rollup. */
  @Get('team-performance')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getTeamPerformance(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.getTeamPerformance(user.sub, organizationId);
  }

  // ── Ad-hoc report execution ─────────────────────────────────────────────────

  @Post('run')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  run(
    @Body() dto: RunReportDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.runReport(dto, user.sub, organizationId);
  }

  // ── Saved reports ────────────────────────────────────────────────────────────

  @Get('saved')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findSaved(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.findSaved(user.sub, organizationId);
  }

  @Post('saved')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  createSaved(
    @Body() dto: CreateSavedReportDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.createSaved(dto, user.sub, organizationId);
  }

  @Get('saved/:id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findSavedOne(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.findSavedOne(id, user.sub, organizationId);
  }

  /** Full replace of a saved report's definition + metadata. */
  @Put('saved/:id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  updateSaved(
    @Param('id') id: string,
    @Body() dto: CreateSavedReportDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.updateSaved(id, dto, user.sub, organizationId);
  }

  @Delete('saved/:id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSaved(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.removeSaved(id, user.sub, organizationId);
  }

  /** Run a stored report, optionally paging/sorting the result. */
  @Post('saved/:id/run')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  runSaved(
    @Param('id') id: string,
    @Query() overrides: RunSavedReportDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.reportsService.runSaved(
      id,
      user.sub,
      organizationId,
      overrides,
    );
  }
}
