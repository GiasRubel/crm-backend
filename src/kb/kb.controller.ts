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
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { KbFeedbackDto } from './dto/kb-feedback.dto';
import {
  KbQueryDto,
  PublicKbOrgDto,
  PublicKbQueryDto,
} from './dto/kb-query.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { KbService } from './kb.service';

@ApiTags('kb')
@Controller('kb')
export class KbController {
  constructor(private readonly kbService: KbService) {}

  // ── Public FAQ (no auth) — declared before :id routes ──────────────────

  /** Published + public articles (list has no bodies). */
  @Get('public')
  @Public()
  findPublic(@Query() query: PublicKbQueryDto) {
    return this.kbService.findPublic(query);
  }

  /** One public article by slug; increments its view counter. */
  @Get('public/:slug')
  @Public()
  findPublicBySlug(
    @Param('slug') slug: string,
    @Query() query: PublicKbOrgDto,
  ) {
    return this.kbService.findPublicBySlug(slug, query.organizationSlug);
  }

  /** Anonymous "was this helpful?" vote. */
  @Post('public/:id/feedback')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  addFeedback(@Param('id') id: string, @Body() dto: KbFeedbackDto) {
    return this.kbService.addFeedback(id, dto);
  }

  // ── Staff wiki management ───────────────────────────────────────────────

  @Post()
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateKbArticleDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.kbService.create(dto, user.sub, organizationId);
  }

  @Get()
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: KbQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.kbService.findAll(query, organizationId);
  }

  @Get('stats')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats(@CurrentOrg() organizationId: Types.ObjectId) {
    return this.kbService.getStats(organizationId);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(
    @Param('id') id: string,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.kbService.findOne(id, organizationId);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKbArticleDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.kbService.update(id, dto, user.sub, organizationId);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.kbService.remove(id, organizationId);
  }
}
