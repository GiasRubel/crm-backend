import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly configService: ConfigService) {
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
  }

  async sendOtp(to: string, code: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
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
  async sendPlain(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
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
