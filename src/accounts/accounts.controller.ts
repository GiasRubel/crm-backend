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
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { AccountsService } from './accounts.service';
import { AccountQueryDto } from './dto/account-query.dto';
import { AssignAccountDto } from './dto/assign-account.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.create(dto, user.sub, organizationId);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: AccountQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.findAll(query, user.sub, organizationId);
  }

  /** CSV export of accounts matching the current list filters (capped, not paginated). */
  @Get('export')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="accounts.csv"')
  exportCsv(
    @Query() query: AccountQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.exportCsv(query, user.sub, organizationId);
  }

  /** Bulk-create accounts from an uploaded CSV file. */
  @Post('import')
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
    return this.accountsService.importCsv(
      file.buffer,
      user.sub,
      organizationId,
    );
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.getStats(user.sub, organizationId);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.findOne(id, user.sub, organizationId);
  }

  /** 360-degree view: profile + linked contacts + linked deals + totals. */
  @Get(':id/summary')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getSummary(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.getSummary(id, user.sub, organizationId);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.update(id, dto, user.sub, organizationId);
  }

  /** Record routing: set/clear the record owner and/or the assigned team. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignAccountDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.assign(
      id,
      dto,
      actorFromJwt(user),
      organizationId,
    );
  }

  /** Deletes the profile; linked contacts/deals are unlinked, not deleted. */
  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.accountsService.remove(id, actorFromJwt(user), organizationId);
  }
}
