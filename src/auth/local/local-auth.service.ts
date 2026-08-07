import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/users.schema';
import { OrganizationsService } from '../../organizations/organizations.service';
import { TokenPairResponseDto } from './dto/token-pair-response.dto';
import {
  LocalAccessTokenPayload,
  LocalRefreshTokenPayload,
} from './local-jwt-payload.interface';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class LocalAuthService {
  private readonly logger = new Logger(LocalAuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly organizationsService: OrganizationsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<TokenPairResponseDto> {
    const user = await this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .exec();

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const organization = await this.organizationsService.findDocById(
      user.organizationId,
    );
    if (!organization || organization.authProvider !== 'local') {
      throw new UnauthorizedException(
        'This account signs in via single sign-on — use the SSO login option instead',
      );
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log(`Local auth login succeeded for ${user.email}`);
    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string): Promise<TokenPairResponseDto> {
    let payload: LocalRefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<LocalRefreshTokenPayload>(
        refreshToken,
        { secret: this.getRefreshSecret() },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userModel
      .findOne({ keycloakId: payload.sub })
      .exec();
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    return this.issueTokenPair(user);
  }

  /** Sets/replaces a local user's password and revokes every outstanding refresh token. */
  async setPassword(userId: Types.ObjectId, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.userModel
      .findByIdAndUpdate(userId, {
        $set: { passwordHash },
        $inc: { tokenVersion: 1 },
      })
      .orFail()
      .exec();
  }

  private async issueTokenPair(
    user: UserDocument,
  ): Promise<TokenPairResponseDto> {
    const expiresIn = this.getAccessTtlSeconds();

    const accessPayload: LocalAccessTokenPayload = {
      sub: user.keycloakId,
      email: user.email,
      type: 'access',
    };
    const refreshPayload: LocalRefreshTokenPayload = {
      sub: user.keycloakId,
      tokenVersion: user.tokenVersion,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.getAccessSecret(),
        expiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.getRefreshSecret(),
        expiresIn: this.getRefreshTtlSeconds(),
      }),
    ]);

    return { accessToken, refreshToken, expiresIn };
  }

  private getAccessSecret(): string {
    return this.configService.getOrThrow<string>('LOCAL_JWT_ACCESS_SECRET');
  }

  private getRefreshSecret(): string {
    return this.configService.getOrThrow<string>('LOCAL_JWT_REFRESH_SECRET');
  }

  private getAccessTtlSeconds(): number {
    return Number(
      this.configService.get<string>('LOCAL_JWT_ACCESS_TTL_SECONDS') ?? 900,
    );
  }

  private getRefreshTtlSeconds(): number {
    return Number(
      this.configService.get<string>('LOCAL_JWT_REFRESH_TTL_SECONDS') ??
        2_592_000,
    );
  }
}
