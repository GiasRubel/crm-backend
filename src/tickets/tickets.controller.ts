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
import {
  AddMyTicketCommentDto,
  AddTicketCommentDto,
} from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateMyTicketDto, CreateTicketDto } from './dto/create-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { SetTicketStatusDto } from './dto/ticket-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth('access-token')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ── Customer portal (AppRole.Customer) — declared before :id routes ────

  /** Raise a ticket for yourself (portal). */
  @Post('my')
  @Roles(AppRole.Customer)
  createMy(
    @Body() dto: CreateMyTicketDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.ticketsService.createMy(dto, user.sub);
  }

  /** Your own tickets (internal notes are never included). */
  @Get('my')
  @Roles(AppRole.Customer)
  findMy(@CurrentUser() user: KeycloakJwtPayload) {
    return this.ticketsService.findMy(user.sub);
  }

  @Get('my/:id')
  @Roles(AppRole.Customer)
  findMyOne(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.ticketsService.findMyOne(id, user.sub);
  }

  /** Reply on your own ticket (reopens resolved tickets). */
  @Post('my/:id/comments')
  @Roles(AppRole.Customer)
  addMyComment(
    @Param('id') id: string,
    @Body() dto: AddMyTicketCommentDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.ticketsService.addMyComment(id, dto, user.sub);
  }

  // ── Staff helpdesk ──────────────────────────────────────────────────────

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.create(dto, user.sub, organizationId);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: TicketQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.findAll(query, user.sub, organizationId);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.getStats(user.sub, organizationId);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.findOne(id, user.sub, organizationId);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.update(id, dto, user.sub, organizationId);
  }

  /** Status workflow (open / in_progress / waiting / resolved / closed). */
  @Patch(':id/status')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetTicketStatusDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.setStatus(id, dto, user.sub, organizationId);
  }

  /** Staff reply or internal note. */
  @Post(':id/comments')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  addComment(
    @Param('id') id: string,
    @Body() dto: AddTicketCommentDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.addComment(id, dto, user.sub, organizationId);
  }

  /** Record routing: set/clear the ticket owner and/or the assigned team. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.ticketsService.assign(
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
    return this.ticketsService.remove(id, actorFromJwt(user), organizationId);
  }
}
