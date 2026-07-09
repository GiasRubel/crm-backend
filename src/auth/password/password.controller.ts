import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { PasswordService } from './password.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  /**
   * POST /auth/password/forgot
   * Public — user is NOT authenticated.
   * Sends a 6-digit OTP to the email if an account exists.
   */
  @Public()
  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  forgot(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.passwordService.sendForgotPasswordOtp(dto.email);
  }

  /**
   * POST /auth/password/reset
   * Public — user is NOT authenticated.
   * Verifies the OTP and resets the Keycloak password.
   */
  @Public()
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.passwordService.resetPassword(
      dto.email,
      dto.code,
      dto.newPassword,
    );
  }
}
