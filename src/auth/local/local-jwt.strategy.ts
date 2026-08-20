import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { KeycloakJwtPayload } from '../interfaces/keycloak-jwt-payload.interface';
import { LocalAccessTokenPayload } from './local-jwt-payload.interface';

/**
 * Second Passport strategy for the JWT guard chain, registered under
 * `local-jwt`. `JwtAuthGuard` tries `jwt` (Keycloak/JWKS) first, then this
 * one — so DB-backed local-auth orgs and Keycloak SSO orgs both authenticate
 * through the same guard, and everything downstream (RolesGuard, org
 * scoping) sees the same `{ sub, email }` shape regardless of provider.
 */
@Injectable()
export class LocalJwtStrategy extends PassportStrategy(Strategy, 'local-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('LOCAL_JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: LocalAccessTokenPayload): KeycloakJwtPayload {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // email_verified: the credentials behind this token were checked against
    // our own users collection, so the address is as trusted as it gets here.
    return { sub: payload.sub, email: payload.email, email_verified: true };
  }
}
