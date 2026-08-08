import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { actorFromJwt } from '../audit/audit.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { MailSettingsService } from './mail-settings.service';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import { TestMailSettingsDto } from './dto/test-mail-settings.dto';

/** Org-scoped custom SMTP configuration for outbound transactional mail. */
@ApiTags('mail-settings')
@ApiBearerAuth('access-token')
@Controller('mail-settings')
@Roles(AppRole.Admin, AppRole.Administrator)
export class MailSettingsController {
  constructor(private readonly mailSettingsService: MailSettingsService) {}

  @Get()
  findOne(@CurrentOrg() organizationId: Types.ObjectId) {
    return this.mailSettingsService.getResponse(organizationId);
  }

  @Patch()
  update(
    @Body() dto: UpdateMailSettingsDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.mailSettingsService.update(
      organizationId,
      dto,
      actorFromJwt(user),
    );
  }

  @Post('test')
  sendTest(
    @Body() dto: TestMailSettingsDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.mailSettingsService
      .sendTest(organizationId, dto.to)
      .then(() => ({ message: 'Test email sent.' }));
  }
}
