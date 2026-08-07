import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { LocalAuthService } from './local-auth.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { AuditService } from '../../audit/audit.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('LocalAuthService', () => {
  let userModel: any;
  let organizationsService: jest.Mocked<OrganizationsService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let auditService: jest.Mocked<AuditService>;
  let service: LocalAuthService;

  const localOrg = { authProvider: 'local' } as any;
  const ssoOrg = { authProvider: 'keycloak' } as any;

  beforeEach(() => {
    userModel = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    organizationsService = {
      findDocById: jest.fn(),
    } as unknown as jest.Mocked<OrganizationsService>;
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;
    configService = {
      getOrThrow: jest.fn((key: string) => `secret-for-${key}`),
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new LocalAuthService(
      userModel,
      organizationsService,
      jwtService,
      configService,
      auditService,
    );

    jwtService.signAsync.mockImplementation(async (payload: any) =>
      payload.type === 'access' ? 'signed-access' : 'signed-refresh',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login', () => {
    const buildUser = () => ({
      _id: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      keycloakId: 'local:1',
      email: 'a@b.com',
      passwordHash: 'hashed',
      tokenVersion: 0,
    });

    it('rejects when no user exists for the email', async () => {
      userModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      });

      await expect(service.login('a@b.com', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects when the user's org is not local-auth", async () => {
      const user = buildUser();
      userModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
      });
      organizationsService.findDocById.mockResolvedValue(ssoOrg);

      await expect(service.login('a@b.com', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects on a wrong password', async () => {
      const user = buildUser();
      userModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
      });
      organizationsService.findDocById.mockResolvedValue(localOrg);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues a token pair on success', async () => {
      const user = buildUser();
      userModel.findOne.mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
      });
      organizationsService.findDocById.mockResolvedValue(localOrg);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('a@b.com', 'correct');

      expect(result).toEqual({
        accessToken: 'signed-access',
        refreshToken: 'signed-refresh',
        expiresIn: 900,
      });
    });
  });

  describe('refresh', () => {
    it('rejects an invalid/expired refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));

      await expect(service.refresh('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token that is not of type refresh', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'local:1',
        type: 'access',
      });

      await expect(service.refresh('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the stored tokenVersion no longer matches (revoked)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'local:1',
        type: 'refresh',
        tokenVersion: 0,
      });
      userModel.findOne.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ keycloakId: 'local:1', tokenVersion: 1 }),
      });

      await expect(service.refresh('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues a fresh token pair when the tokenVersion matches', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'local:1',
        type: 'refresh',
        tokenVersion: 0,
      });
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          keycloakId: 'local:1',
          email: 'a@b.com',
          tokenVersion: 0,
        }),
      });

      const result = await service.refresh('token');

      expect(result.accessToken).toBe('signed-access');
      expect(result.refreshToken).toBe('signed-refresh');
    });
  });

  describe('setPassword', () => {
    it('hashes the password and bumps tokenVersion', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      const orFail = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      userModel.findByIdAndUpdate.mockReturnValue({ orFail });
      const userId = new Types.ObjectId();

      await service.setPassword(userId, 'newpassword');

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 12);
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
        $set: { passwordHash: 'new-hash' },
        $inc: { tokenVersion: 1 },
      });
    });
  });
});
