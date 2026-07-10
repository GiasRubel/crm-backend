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
import { AutomationsService } from './automations.service';
import { RuleQueryDto, RunQueryDto } from './dto/automation-query.dto';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

/** Rule engine configuration is admin-only end to end. */
@Controller('automations')
@Roles(AppRole.Admin, AppRole.Administrator)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Post()
  create(
    @Body() dto: CreateAutomationRuleDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.automationsService.create(dto, user.sub);
  }

  @Get()
  findAll(@Query() query: RuleQueryDto) {
    return this.automationsService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.automationsService.getStats();
  }

  /** Execution log (filter by ruleId / status). */
  @Get('runs')
  findRuns(@Query() query: RunQueryDto) {
    return this.automationsService.findRuns(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.automationsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    return this.automationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.automationsService.remove(id);
  }
}
