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
import { ALLOWED_MIME_TYPES, safeContentType } from './mime-allowlist';

const DEFAULT_MAX_ATTACHMENT_MB = 15;

/**
 * Multer's own ceiling, applied while the request body is being read.
 *
 * The `MAX_ATTACHMENT_SIZE_MB` check below runs *after* the upload is fully
 * buffered in memory, so on its own it cannot stop a multi-gigabyte POST from
 * exhausting the heap first. This limit is the one that actually protects the
 * process; it is deliberately generous relative to the business limit so the
 * business limit stays the one users see, and is a constant rather than config
 * because an interceptor's options are evaluated at class-decoration time,
 * before any ConfigService exists.
 */
const HARD_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: HARD_UPLOAD_LIMIT_BYTES,
        files: 1,
        // Cap the multipart envelope too — unbounded field counts and name
        // lengths are their own cheap memory-exhaustion vector.
        fields: 10,
        fieldSize: 64 * 1024,
        fieldNameSize: 200,
      },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException(
              `Files of type "${file.mimetype}" are not accepted`,
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
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
    // `mimeType` is whatever the uploading client claimed, so it is never echoed
    // verbatim: downgrade anything not known-inline-safe to a binary stream, and
    // forbid content sniffing so the browser cannot override us either way.
    res.setHeader('Content-Type', safeContentType(attachment.mimeType));
    res.setHeader('X-Content-Type-Options', 'nosniff');
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
