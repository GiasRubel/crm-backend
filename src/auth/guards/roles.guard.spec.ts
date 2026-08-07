import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { RolesGuard } from './roles.guard';
import { UsersService } from '../../users/users.service';
import { AppRole } from '../../users/app-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let usersService: jest.Mocked<UsersService>;

  const createContext = (request: object): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    usersService = {
      findByKeycloakId: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    guard = new RolesGuard(reflector, usersService);
  });

  it('allows @Public() routes without checking the user', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);

    const result = await guard.canActivate(createContext({ user: undefined }));

    expect(result).toBe(true);
    expect(usersService.findByKeycloakId).not.toHaveBeenCalled();
  });

  it('rejects when the request has no authenticated JWT subject', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(false);

    await expect(
      guard.canActivate(createContext({ user: undefined })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows through on unroled routes when no app user record exists yet', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce(undefined); // requiredRoles
    usersService.findByKeycloakId.mockResolvedValue(null);

    const request = { user: { sub: 'kc-1' } };
    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it('rejects when a roled route has no app user record', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([AppRole.Admin]);
    usersService.findByKeycloakId.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext({ user: { sub: 'kc-1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('attaches organizationId and allows when no roles are required', async () => {
    const organizationId = new Types.ObjectId();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);
    usersService.findByKeycloakId.mockResolvedValue({
      organizationId,
      role: AppRole.User,
    } as any);

    const request: any = { user: { sub: 'kc-1' } };
    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.organizationId).toBe(organizationId);
  });

  it('allows when the app user has one of the required roles', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([AppRole.Admin, AppRole.Administrator]);
    usersService.findByKeycloakId.mockResolvedValue({
      organizationId: new Types.ObjectId(),
      role: AppRole.Admin,
    } as any);

    const result = await guard.canActivate(
      createContext({ user: { sub: 'kc-1' } }),
    );

    expect(result).toBe(true);
  });

  it('rejects when the app user lacks the required role', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([AppRole.Admin]);
    usersService.findByKeycloakId.mockResolvedValue({
      organizationId: new Types.ObjectId(),
      role: AppRole.User,
    } as any);

    await expect(
      guard.canActivate(createContext({ user: { sub: 'kc-1' } })),
    ).rejects.toThrow(ForbiddenException);
  });
});
