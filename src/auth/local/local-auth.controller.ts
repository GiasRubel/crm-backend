import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { LocalAuthService } from './local-auth.service';
import { LocalLoginDto } from './dto/local-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResolveAuthProviderDto } from './dto/resolve-auth-provider.dto';
import { TokenPairResponseDto } from './dto/token-pair-response.dto';
import { UsersService } from '../../users/users.service';
import { OrganizationsService } from '../../organizations/organizations.service';

@ApiTags('auth/local')
@Controller('auth/local')
export class LocalAuthController {
  constructor(
    private readonly localAuthService: LocalAuthService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /** Public — exchanges email+password for an access/refresh token pair. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LocalLoginDto): Promise<TokenPairResponseDto> {
    return this.localAuthService.login(dto.email, dto.password);
  }

  /** Public — exchanges a still-valid refresh token for a new pair. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairResponseDto> {
    return this.localAuthService.refresh(dto.refreshToken);
  }

  /**
   * Public — tells the caller (the frontend login page) which flow to render
   * for a given email. Defaults to 'keycloak' for unknown emails, the same
   * enumeration-safe non-committal pattern as the forgot-password flow.
   */
  @Public()
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Body() dto: ResolveAuthProviderDto,
  ): Promise<{ authProvider: 'keycloak' | 'local' }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return { authProvider: 'keycloak' };
    }

    const organization = await this.organizationsService.findDocById(
      user.organizationId,
    );
    return { authProvider: organization?.authProvider ?? 'keycloak' };
  }
}
