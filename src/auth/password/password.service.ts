import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { UsersService } from '../../users/users.service';
import { OtpService } from '../../otp/otp.service';
import { KeycloakAdminService } from '../../keycloak-admin/keycloak-admin.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { LocalAuthService } from '../local/local-auth.service';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly keycloakAdminService: KeycloakAdminService,
    private readonly organizationsService: OrganizationsService,
    private readonly localAuthService: LocalAuthService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Step 1 — Send a 6-digit OTP to the user's registered email.
   * Returns the same success message regardless of whether the email exists
   * to prevent user enumeration attacks.
   */
  async sendForgotPasswordOtp(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (user) {
      await this.otpService.generateAndSend(
        user.keycloakId,
        user.email,
        user.organizationId,
      );
      this.logger.log(`Forgot-password OTP sent to ${email}`);
      void this.auditService.log({
        organizationId: user.organizationId,
        actor: { id: user.keycloakId, email: user.email },
        action: 'password_reset_requested',
        entityType: 'auth',
        summary: `Password reset requested for ${user.email}`,
      });
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

    // OTP verified — update the password wherever this user's org keeps it.
    // Also doubles as the "set your initial password" step for a freshly
    // admin-invited local-auth user, since no password exists yet.
    const organization = await this.organizationsService.findDocById(
      user.organizationId,
    );
    if (organization?.authProvider === 'local') {
      await this.localAuthService.setPassword(user._id, newPassword);
    } else {
      await this.keycloakAdminService.resetPassword(
        user.keycloakId,
        newPassword,
      );
    }

    this.logger.log(`Password reset successfully for ${email}`);
    void this.auditService.log({
      organizationId: user.organizationId,
      actor: { id: user.keycloakId, email: user.email },
      action: 'password_reset_completed',
      entityType: 'auth',
      summary: `Password reset completed for ${user.email}`,
    });
    return { message: 'Password reset successfully. You can now log in.' };
  }
}
