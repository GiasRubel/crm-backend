import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import {
  CALENDAR_PROVIDERS,
  CalendarProvider,
} from './calendar-connection.schema';
import { CalendarSyncService } from './calendar-sync.service';

function assertProvider(provider: string): CalendarProvider {
  if (!(CALENDAR_PROVIDERS as readonly string[]).includes(provider)) {
    throw new BadRequestException(`Unknown calendar provider "${provider}"`);
  }
  return provider as CalendarProvider;
}

@ApiTags('calendar-sync')
@ApiBearerAuth('access-token')
@Controller('calendar-sync')
export class CalendarSyncController {
  constructor(private readonly calendarSyncService: CalendarSyncService) {}

  @Get('connections')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  listConnections(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.calendarSyncService.listConnections(user.sub, organizationId);
  }

  @Get(':provider/authorize')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getAuthorizeUrl(
    @Param('provider') provider: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.calendarSyncService.getAuthorizeUrl(
      assertProvider(provider),
      user.sub,
      organizationId,
    );
  }

  /**
   * The provider redirects the browser here after consent. This route rides
   * through the frontend's existing `/api/backend/*` BFF proxy — no public
   * frontend code change was needed — so it's authenticated like any other
   * endpoint, but it must reply with HTML (not JSON): the browser is
   * navigating here directly, there's no client-side JS to read a JSON body.
   */
  @Get(':provider/callback')
  @Public()
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const html = await this.calendarSyncService.handleCallback(
      assertProvider(provider),
      code,
      state,
      error,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post(':id/sync-now')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  syncNow(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.calendarSyncService.syncNow(id, user.sub, organizationId);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.calendarSyncService.disconnect(id, user.sub, organizationId);
  }
}
