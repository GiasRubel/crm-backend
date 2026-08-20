import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { PasswordService } from './password.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ThrottleLogin, ThrottleOtp } from '../../config/throttle';

@ApiTags('auth/password')
@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  /**
   * POST /auth/password/forgot
   * Public — user is NOT authenticated.
   * Sends a 6-digit OTP to the email if an account exists.
   */
  @Public()
  @ThrottleOtp()
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
  @ThrottleLogin()
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
