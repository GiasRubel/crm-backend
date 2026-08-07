import './test-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { KeycloakJwtPayload } from '../../src/auth/interfaces/keycloak-jwt-payload.interface';

/**
 * Real signing secret for e2e-issued tokens. `JwtStrategy` is a normal
 * (non-APP_GUARD) provider, so it's the one piece of the auth chain we can
 * cleanly override via `.overrideProvider()` — everything else (JwtAuthGuard,
 * RolesGuard, SubscriptionGuard) runs unmodified against real Mongo data.
 * `AuthGuard('jwt')`'s passport pipeline still does full signature + expiry
 * verification; only the key material is swapped for a test secret.
 */
export const E2E_JWT_SECRET = 'e2e-test-jwt-secret';

class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: E2E_JWT_SECRET,
      algorithms: ['HS256'],
    });
  }

  validate(payload: KeycloakJwtPayload): KeycloakJwtPayload {
    return payload;
  }
}

/** Signs a real, verifiable JWT for e2e requests — `Authorization: Bearer <token>`. */
export function signTestJwt(
  payload: Partial<KeycloakJwtPayload> & { sub: string },
): string {
  return jwt.sign(payload, E2E_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

export async function createE2eApp(): Promise<{ app: INestApplication }> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(JwtStrategy)
    .useClass(TestJwtStrategy)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app };
}
