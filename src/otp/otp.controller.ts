import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  /**
   * POST /auth/otp/send
   * Protected by the global JwtAuthGuard — user must have a valid Keycloak token.
   * Generates a 6-digit OTP and sends it to the user's email.
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(
    @CurrentUser() user: KeycloakJwtPayload,
  ): Promise<{ message: string }> {
    if (!user.email) {
      return { message: 'No email associated with this account.' };
    }
    await this.otpService.generateAndSend(user.sub, user.email);
    return { message: 'OTP sent to your email address.' };
  }

  /**
   * POST /auth/otp/verify
   * Protected by the global JwtAuthGuard.
   * Validates the submitted OTP and marks the user as OTP-verified.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentUser() user: KeycloakJwtPayload,
    @Body() dto: VerifyOtpDto,
  ): Promise<{ message: string }> {
    await this.otpService.verify(user.sub, dto.code);
    return { message: 'OTP verified successfully.' };
  }
}
