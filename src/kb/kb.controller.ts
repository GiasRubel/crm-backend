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
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { KbFeedbackDto } from './dto/kb-feedback.dto';
import { KbQueryDto, PublicKbQueryDto } from './dto/kb-query.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { KbService } from './kb.service';

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
  findPublicBySlug(@Param('slug') slug: string) {
    return this.kbService.findPublicBySlug(slug);
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
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  create(
    @Body() dto: CreateKbArticleDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.kbService.create(dto, user.sub);
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(@Query() query: KbQueryDto) {
    return this.kbService.findAll(query);
  }

  @Get('stats')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  getStats() {
    return this.kbService.getStats();
  }

  @Get(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findOne(@Param('id') id: string) {
    return this.kbService.findOne(id);
  }

  @Patch(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKbArticleDto,
    @CurrentUser() user: KeycloakJwtPayload,
  ) {
    return this.kbService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.kbService.remove(id);
  }
}
