import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalJwtStrategy } from './local-jwt.strategy';
import { LocalAccessTokenPayload } from './local-jwt-payload.interface';

describe('LocalJwtStrategy', () => {
  const buildConfigService = () =>
    ({
      getOrThrow: jest.fn(() => 'test-secret'),
    }) as unknown as ConfigService;

  it('returns a KeycloakJwtPayload-shaped object for a valid access token', () => {
    const strategy = new LocalJwtStrategy(buildConfigService());
    const payload: LocalAccessTokenPayload = {
      sub: 'local:abc',
      email: 'a@b.com',
      type: 'access',
    };

    expect(strategy.validate(payload)).toEqual({
      sub: 'local:abc',
      email: 'a@b.com',
    });
  });

  it('rejects a refresh token presented as an access token', () => {
    const strategy = new LocalJwtStrategy(buildConfigService());
    const payload = {
      sub: 'local:abc',
      tokenVersion: 0,
      type: 'refresh',
    } as unknown as LocalAccessTokenPayload;

    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
