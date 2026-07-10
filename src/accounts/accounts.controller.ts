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
import { AccountsService } from './accounts.service';
import { AccountQueryDto } from './dto/account-query.dto';
import { AssignAccountDto } from './dto/assign-account.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.accountsService.create(dto, user.sub);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: AccountQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.accountsService.findAll(query, user.sub);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(@CurrentUser() user: KeycloakJwtPayload) {
    return this.accountsService.getStats(user.sub);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.accountsService.findOne(id, user.sub);
  }

  /** 360-degree view: profile + linked contacts + linked deals + totals. */
  @Get(':id/summary')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getSummary(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.accountsService.getSummary(id, user.sub);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.accountsService.update(id, dto, user.sub);
  }

  /** Record routing: set/clear the record owner and/or the assigned team. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(@Param('id') id: string, @Body() dto: AssignAccountDto) {
    return this.accountsService.assign(id, dto);
  }

  /** Deletes the profile; linked contacts/deals are unlinked, not deleted. */
  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.accountsService.remove(id);
  }
}
