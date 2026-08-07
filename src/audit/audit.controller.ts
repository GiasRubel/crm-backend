import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../users/app-role.enum';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

/** Read-only audit trail — who did what, to which record, and when. */
@ApiTags('audit-logs')
@ApiBearerAuth('access-token')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator)
  findAll(
    @Query() query: AuditQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.auditService.findAll(query, organizationId);
  }
}
