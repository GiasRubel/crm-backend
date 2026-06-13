import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { OtpService } from '../../otp/otp.service';
import { KeycloakAdminService } from '../../keycloak-admin/keycloak-admin.service';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly keycloakAdminService: KeycloakAdminService,
  ) {}

  /**
   * Step 1 — Send a 6-digit OTP to the user's registered email.
   * Returns the same success message regardless of whether the email exists
   * to prevent user enumeration attacks.
   */
  async sendForgotPasswordOtp(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (user) {
      await this.otpService.generateAndSend(user.keycloakId, user.email);
      this.logger.log(`Forgot-password OTP sent to ${email}`);
    } else {
      // Log but don't reveal that the email doesn't exist
      this.logger.warn(`Forgot-password attempt for unknown email: ${email}`);
    }

    return {
      message: 'If an account with that email exists, an OTP has been sent.',
    };
  }

  /**
   * Step 2 — Verify the OTP and reset the password in Keycloak.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('No account found for this email address.');
    }

    // Throws BadRequestException / ForbiddenException on invalid/expired OTP
    await this.otpService.verify(user.keycloakId, code);

    // OTP verified — update password in Keycloak
    await this.keycloakAdminService.resetPassword(user.keycloakId, newPassword);

    this.logger.log(`Password reset successfully for ${email}`);
    return { message: 'Password reset successfully. You can now log in.' };
  }
}
