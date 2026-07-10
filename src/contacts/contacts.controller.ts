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
import { ContactsService } from './contacts.service';
import { AddInteractionDto } from './dto/add-interaction.dto';
import { AssignContactDto } from './dto/assign-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.contactsService.create(dto, user.sub);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: ContactQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.contactsService.findAll(query, user.sub);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(@CurrentUser() user: KeycloakJwtPayload) {
    return this.contactsService.getStats(user.sub);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.contactsService.findOne(id, user.sub);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.contactsService.update(id, dto, user.sub);
  }

  /** Log a communication touchpoint (call/email/meeting/sms/note). */
  @Post(':id/interactions')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  addInteraction(
    @Param('id') id: string,
    @Body() dto: AddInteractionDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.contactsService.addInteraction(id, dto, user.sub);
  }

  /** Record routing: set/clear the record owner and/or the assigned team. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(@Param('id') id: string, @Body() dto: AssignContactDto) {
    return this.contactsService.assign(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.contactsService.remove(id);
  }
}
