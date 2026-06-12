import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { KeycloakJwtPayload } from '../interfaces/keycloak-jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly clientId: string;

  constructor(configService: ConfigService) {
    const authServerUrl = configService
      .get<string>('KEYCLOAK_AUTH_SERVER_URL')!
      .replace(/\/$/, '');
    const realm = configService.get<string>('KEYCLOAK_REALM')!;
    const clientId = configService.get<string>('KEYCLOAK_CLIENT_ID')!;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: `${authServerUrl}/realms/${realm}`,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${authServerUrl}/realms/${realm}/protocol/openid-connect/certs`,
      }),
    });

    this.clientId = clientId;
  }

  validate(payload: KeycloakJwtPayload): KeycloakJwtPayload {
    if (payload.azp && payload.azp !== this.clientId) {
      throw new UnauthorizedException('Invalid token client');
    }

    return payload;
  }
}
