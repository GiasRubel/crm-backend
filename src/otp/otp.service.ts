import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Otp, OtpDocument } from './otp.schema';
import { MailService } from '../mail/mail.service';

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 3;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(Otp.name) private readonly otpModel: Model<OtpDocument>,
    private readonly mailService: MailService,
  ) {}

  /**
   * Generate a 6-digit OTP, store it with TTL, and email it.
   * The `key` is typically the user's Keycloak ID.
   */
  async generateAndSend(
    key: string,
    email: string,
    organizationId?: Types.ObjectId,
  ): Promise<void> {
    // Replace any existing OTP for this key
    await this.otpModel.deleteOne({ keycloakId: key }).exec();

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.otpModel.create({
      keycloakId: key,
      code,
      attempts: 0,
      expiresAt,
    });
    this.logger.log(`OTP generated for ${email}`);
    await this.mailService.sendOtp(email, code, organizationId);
  }

  /**
   * Verify the submitted OTP for the given key.
   * Throws on expired, wrong code, or too many attempts.
   * Deletes the OTP record on success.
   */
  async verify(key: string, submittedCode: string): Promise<void> {
    const record = await this.otpModel.findOne({ keycloakId: key }).exec();

    if (!record) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    if (record.expiresAt < new Date()) {
      await record.deleteOne();
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await record.deleteOne();
      throw new ForbiddenException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    if (record.code !== submittedCode) {
      record.attempts += 1;
      await record.save();
      const remaining = MAX_ATTEMPTS - record.attempts;
      throw new BadRequestException(
        `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    // ✅ Success — delete the used OTP
    await record.deleteOne();
  }

  private generateCode(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }
}
