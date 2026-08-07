import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LicensingGuard } from './licensing.guard';
import { LicensingService } from './licensing.service';

describe('LicensingGuard', () => {
  let reflector: Reflector;
  let configService: jest.Mocked<ConfigService>;
  let licensingService: jest.Mocked<LicensingService>;
  let guard: LicensingGuard;

  const createContext = (): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    configService = { get: jest.fn() } as unknown as jest.Mocked<ConfigService>;
    licensingService = {
      isActivated: jest.fn(),
    } as unknown as jest.Mocked<LicensingService>;
    guard = new LicensingGuard(reflector, configService, licensingService);
  });

  it('allows everything outside production', () => {
    configService.get.mockReturnValue('development');

    expect(guard.canActivate(createContext())).toBe(true);
    expect(licensingService.isActivated).not.toHaveBeenCalled();
  });

  it('allows every route once the install is activated in production', () => {
    configService.get.mockReturnValue('production');
    licensingService.isActivated.mockReturnValue(true);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows @Public() routes in production when not activated', () => {
    configService.get.mockReturnValue('production');
    licensingService.isActivated.mockReturnValue(false);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('blocks non-public routes in production when not activated', () => {
    configService.get.mockReturnValue('production');
    licensingService.isActivated.mockReturnValue(false);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    expect(() => guard.canActivate(createContext())).toThrow(HttpException);
  });
});
