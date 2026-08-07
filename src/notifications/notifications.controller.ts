import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.notificationsService.findForUser(user.sub, organizationId, {
      unreadOnly: query.unreadOnly === 'true',
      limit: query.limit,
    });
  }

  @Get('unread-count')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  async unreadCount(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    const count = await this.notificationsService.unreadCount(
      user.sub,
      organizationId,
    );
    return { count };
  }

  @Patch('read-all')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  markAllRead(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.notificationsService.markAllRead(user.sub, organizationId);
  }

  @Patch(':id/read')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.notificationsService.markRead(id, user.sub, organizationId);
  }
}
