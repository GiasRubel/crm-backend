import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import {
  OrgMailSettings,
  OrgMailSettingsDocument,
} from '../mail-settings/org-mail-settings.schema';
import {
  decryptSecret,
  deriveMailEncryptionKey,
} from '../mail-settings/crypto.util';

interface ResolvedSender {
  transporter: nodemailer.Transporter;
  fromAddress: string;
  fromName: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(OrgMailSettings.name)
    private readonly orgMailSettingsModel: Model<OrgMailSettingsDocument>,
  ) {
    this.fromAddress = configService.get<string>(
      'MAIL_FROM_ADDRESS',
      'noreply@crmpro.com',
    );
    this.fromName = configService.get<string>('MAIL_FROM_NAME', 'CRM Pro');

    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('MAIL_HOST'),
      port: configService.get<number>('MAIL_PORT'),
      secure: false, // STARTTLS on port 587
      auth: {
        user: configService.get<string>('MAIL_USER'),
        pass: configService.get<string>('MAIL_PASS'),
      },
    });

    this.encryptionKey = deriveMailEncryptionKey(
      configService.get<string>(
        'MAIL_SETTINGS_ENCRYPTION_KEY',
        'dev-mail-settings-encryption-key-change-me',
      ),
    );
  }

  /** Resolve the org's custom SMTP override if configured+enabled, else the system-wide sender. */
  private async resolveSender(
    organizationId?: Types.ObjectId | string,
  ): Promise<ResolvedSender> {
    const fallback: ResolvedSender = {
      transporter: this.transporter,
      fromAddress: this.fromAddress,
      fromName: this.fromName,
    };
    if (!organizationId) return fallback;

    const doc = await this.orgMailSettingsModel
      .findOne({
        organizationId: new Types.ObjectId(organizationId.toString()),
        enabled: true,
      })
      .exec();
    if (!doc?.host || !doc.user || !doc.encryptedPass) return fallback;

    try {
      return {
        transporter: nodemailer.createTransport({
          host: doc.host,
          port: doc.port ?? 587,
          secure: doc.secure,
          auth: {
            user: doc.user,
            pass: decryptSecret(doc.encryptedPass, this.encryptionKey),
          },
        }),
        fromAddress: doc.fromAddress || this.fromAddress,
        fromName: doc.fromName || this.fromName,
      };
    } catch (error) {
      this.logger.error(
        `Failed to build custom SMTP transporter for org ${organizationId.toString()}, falling back to system mail`,
        error,
      );
      return fallback;
    }
  }

  async sendOtp(
    to: string,
    code: string,
    organizationId?: Types.ObjectId | string,
  ): Promise<void> {
    const { transporter, fromAddress, fromName } =
      await this.resolveSender(organizationId);
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject: 'Your CRM Pro verification code',
        text: `Your one-time verification code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f172a; border-radius: 16px; color: #e2e8f0;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #6366f1; border-radius: 12px; margin-bottom: 12px;">
                <span style="color: #fff; font-size: 22px; font-weight: 900;">C</span>
              </div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #f1f5f9;">CRM Pro</h1>
            </div>

            <h2 style="font-size: 18px; font-weight: 600; color: #f1f5f9; margin: 0 0 8px;">Verification Code</h2>
            <p style="font-size: 14px; color: #94a3b8; margin: 0 0 28px;">Use the code below to complete your sign-in. It expires in <strong style="color: #e2e8f0;">5 minutes</strong>.</p>

            <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 28px;">
              <span style="font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #818cf8; font-family: monospace;">${code}</span>
            </div>

            <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">If you did not request this code, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
      throw error;
    }
  }

  /** Generic plain-text mail (used by automation send_email actions). */
  async sendPlain(
    to: string,
    subject: string,
    text: string,
    organizationId?: Types.ObjectId | string,
  ): Promise<void> {
    const { transporter, fromAddress, fromName } =
      await this.resolveSender(organizationId);
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        text,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
