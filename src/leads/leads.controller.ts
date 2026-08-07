import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { actorFromJwt } from '../audit/audit.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { AddEngagementDto } from './dto/add-engagement.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CaptureLeadDto } from './dto/capture-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Unauthenticated lead ingestion (public website form / external API).
   * Always answers 202 with no body — anonymous callers learn nothing
   * about existing records.
   */
  @Post('capture')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async capture(@Body() dto: CaptureLeadDto): Promise<void> {
    await this.leadsService.capture(dto);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.create(dto, user.sub, organizationId);
  }

  @Get()
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: LeadQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.findAll(query, user.sub, organizationId);
  }

  /** CSV export of leads matching the current list filters (capped, not paginated). */
  @Get('export')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  exportCsv(
    @Query() query: LeadQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.exportCsv(query, user.sub, organizationId);
  }

  /** Bulk-create leads from an uploaded CSV file. */
  @Post('import')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  importCsv(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    if (!file) throw new BadRequestException('No CSV file was uploaded');
    return this.leadsService.importCsv(file.buffer, user.sub, organizationId);
  }

  @Get('stats')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.getStats(user.sub, organizationId);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.findOne(id, user.sub, organizationId);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.update(id, dto, user.sub, organizationId);
  }

  /** Log an engagement touchpoint; the lead score is recomputed. */
  @Post(':id/engagements')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  addEngagement(
    @Param('id') id: string,
    @Body() dto: AddEngagementDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.addEngagement(id, dto, user.sub, organizationId);
  }

  /** Record routing: set/clear the record owner and/or the assigned team. */
  @Patch(':id/assign')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.assign(
      id,
      dto,
      actorFromJwt(user),
      organizationId,
    );
  }

  /** Convert a qualified lead into a Customer (+ optionally an Opportunity). */
  @Post(':id/convert')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.convert(id, dto, user.sub, organizationId);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.leadsService.remove(id, actorFromJwt(user), organizationId);
  }
}
