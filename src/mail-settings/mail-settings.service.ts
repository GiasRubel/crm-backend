import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { AuditActor, AuditService, diffFields } from '../audit/audit.service';
import {
  OrgMailSettings,
  OrgMailSettingsDocument,
} from './org-mail-settings.schema';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import { MailSettingsResponseDto } from './dto/mail-settings-response.dto';
import { toMailSettingsResponseDto } from './mappers/mail-settings.mapper';
import {
  decryptSecret,
  deriveMailEncryptionKey,
  encryptSecret,
} from './crypto.util';

const AUDITED_FIELDS = [
  'enabled',
  'host',
  'port',
  'secure',
  'user',
  'fromAddress',
  'fromName',
];

@Injectable()
export class MailSettingsService {
  private readonly logger = new Logger(MailSettingsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectModel(OrgMailSettings.name)
    private readonly model: Model<OrgMailSettingsDocument>,
    configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const secret = configService.get<string>(
      'MAIL_SETTINGS_ENCRYPTION_KEY',
      'dev-mail-settings-encryption-key-change-me',
    );
    this.encryptionKey = deriveMailEncryptionKey(secret);
  }

  async getResponse(
    organizationId: Types.ObjectId,
  ): Promise<MailSettingsResponseDto> {
    const doc = await this.model.findOne({ organizationId }).exec();
    return toMailSettingsResponseDto(doc);
  }

  async update(
    organizationId: Types.ObjectId,
    dto: UpdateMailSettingsDto,
    actor: AuditActor,
  ): Promise<MailSettingsResponseDto> {
    let doc = await this.model.findOne({ organizationId }).exec();
    const isNew = !doc;
    const before = doc?.toObject() ?? {};
    if (!doc) {
      doc = new this.model({ organizationId });
    }

    if (dto.enabled !== undefined) doc.enabled = dto.enabled;
    if (dto.host !== undefined) doc.host = dto.host.trim();
    if (dto.port !== undefined) doc.port = dto.port;
    if (dto.secure !== undefined) doc.secure = dto.secure;
    if (dto.user !== undefined) doc.user = dto.user.trim();
    if (dto.pass)
      doc.encryptedPass = encryptSecret(dto.pass, this.encryptionKey);
    if (dto.fromAddress !== undefined)
      doc.fromAddress = dto.fromAddress.trim().toLowerCase();
    if (dto.fromName !== undefined) doc.fromName = dto.fromName.trim();

    if (
      doc.enabled &&
      (!doc.host || !doc.user || !doc.encryptedPass || !doc.fromAddress)
    ) {
      throw new BadRequestException(
        'Host, username, password, and from address are required to enable custom SMTP.',
      );
    }

    await doc.save();

    const changes = diffFields(before, doc.toObject(), AUDITED_FIELDS);
    void this.auditService.log({
      organizationId,
      actor,
      action: isNew ? 'create' : 'update',
      entityType: 'mail_settings',
      entityId: organizationId.toString(),
      entityLabel: 'Email (SMTP) settings',
      summary: `${isNew ? 'Configured' : 'Updated'} organization SMTP settings`,
      changes,
    });

    return toMailSettingsResponseDto(doc);
  }

  async sendTest(organizationId: Types.ObjectId, to: string): Promise<void> {
    const doc = await this.model.findOne({ organizationId }).exec();
    if (!doc?.enabled || !doc.host || !doc.user || !doc.encryptedPass) {
      throw new BadRequestException(
        'Enable and save custom SMTP settings before sending a test email.',
      );
    }

    const transporter = nodemailer.createTransport({
      host: doc.host,
      port: doc.port ?? 587,
      secure: doc.secure,
      auth: {
        user: doc.user,
        pass: decryptSecret(doc.encryptedPass, this.encryptionKey),
      },
    });

    try {
      await transporter.sendMail({
        from: `"${doc.fromName || 'CRM Pro'}" <${doc.fromAddress}>`,
        to,
        subject: 'CRM Pro test email',
        text: 'This is a test email confirming your custom SMTP settings are working correctly.',
      });
    } catch (error) {
      this.logger.error(
        `Test email failed for org ${organizationId.toString()}`,
        error,
      );
      throw new BadRequestException(
        `Failed to send test email: ${(error as Error).message}`,
      );
    }
  }
}
