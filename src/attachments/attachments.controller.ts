import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import { actorFromJwt } from '../audit/audit.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { AppRole } from '../users/app-role.enum';
import { AttachmentsService } from './attachments.service';
import { AttachmentQueryDto } from './dto/attachment-query.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

const DEFAULT_MAX_ATTACHMENT_MB = 15;

@ApiTags('attachments')
@ApiBearerAuth('access-token')
@Controller('attachments')
export class AttachmentsController {
  private readonly maxSizeBytes: number;

  constructor(
    private readonly attachmentsService: AttachmentsService,
    configService: ConfigService,
  ) {
    const maxMb = configService.get<number>(
      'MAX_ATTACHMENT_SIZE_MB',
      DEFAULT_MAX_ATTACHMENT_MB,
    );
    this.maxSizeBytes = maxMb * 1024 * 1024;
  }

  @Post()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadAttachmentDto,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');
    if (file.size > this.maxSizeBytes) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(this.maxSizeBytes / (1024 * 1024))}MB limit`,
      );
    }
    return this.attachmentsService.upload(
      dto.entityType,
      dto.entityId,
      {
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
      actorFromJwt(user),
      organizationId,
    );
  }

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: AttachmentQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.attachmentsService.findAllForEntity(
      query.entityType,
      query.entityId,
      organizationId,
    );
  }

  @Get(':id/download')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  async download(
    @Param('id') id: string,
    @CurrentOrg() organizationId: Types.ObjectId,
    @Res() res: Response,
  ): Promise<void> {
    const { attachment, absolutePath } =
      await this.attachmentsService.getFileOrFail(id, organizationId);
    const safeName = attachment.originalName.replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.sendFile(absolutePath);
  }

  @Delete(':id')
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: KeycloakJwtPayload,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.attachmentsService.remove(
      id,
      actorFromJwt(user),
      organizationId,
    );
  }
}
