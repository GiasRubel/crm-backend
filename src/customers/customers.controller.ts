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
import { CustomersService } from './customers.service';
import { AssignCustomerDto } from './dto/assign-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator)
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.customersService.create(dto, user.sub);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.customersService.findAll(query, user.sub);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(@CurrentUser() user: KeycloakJwtPayload) {
    return this.customersService.getStats(user.sub);
  }

  /** Self-service profile for a signed-in customer (customer portal). */
  @Get('me')
  @Roles(AppRole.Customer)
  findMyProfile(@CurrentUser() user: KeycloakJwtPayload) {
    return this.customersService.findMyProfile(user.sub);
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(@Param('id') id: string, @CurrentUser() user: KeycloakJwtPayload) {
    return this.customersService.findOne(id, user.sub);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  /** Record routing: set/clear the record owner and/or the assigned team. */
  @Patch(':id/assign')
  @Roles(AppRole.Admin, AppRole.Administrator)
  assign(@Param('id') id: string, @Body() dto: AssignCustomerDto) {
    return this.customersService.assign(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Post(':id/resend')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.OK)
  resendInvitation(@Param('id') id: string) {
    return this.customersService.resendInvitation(id);
  }
}
