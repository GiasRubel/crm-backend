import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { KeycloakJwtPayload } from '../interfaces/keycloak-jwt-payload.interface';

describe('JwtStrategy', () => {
  const buildConfigService = () =>
    ({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          KEYCLOAK_AUTH_SERVER_URL: 'http://keycloak.local/auth',
          KEYCLOAK_REALM: 'crm',
          KEYCLOAK_CLIENT_ID: 'crm-frontend',
        };
        return values[key];
      }),
    }) as unknown as ConfigService;

  it('returns the payload when azp matches the configured client id', () => {
    const strategy = new JwtStrategy(buildConfigService());
    const payload: KeycloakJwtPayload = { sub: 'user-1', azp: 'crm-frontend' };

    expect(strategy.validate(payload)).toBe(payload);
  });

  it('returns the payload when azp is absent', () => {
    const strategy = new JwtStrategy(buildConfigService());
    const payload: KeycloakJwtPayload = { sub: 'user-1' };

    expect(strategy.validate(payload)).toBe(payload);
  });

  it('rejects a token issued for a different client', () => {
    const strategy = new JwtStrategy(buildConfigService());
    const payload: KeycloakJwtPayload = { sub: 'user-1', azp: 'some-other-app' };

    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
