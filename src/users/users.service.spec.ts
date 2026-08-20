import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AppRole } from './app-role.enum';
import { UsersService } from './users.service';
import type { KeycloakJwtPayload } from '../auth/interfaces/keycloak-jwt-payload.interface';

/**
 * Regression cover for the three tenancy/identity defects fixed in the
 * pre-release security pass: email rebinding (C1), the unscoped staff
 * directory (C2), and the unscoped staff lookups used to validate
 * user-supplied foreign keys (C3).
 */

const ORG_A = new Types.ObjectId();
const ORG_B = new Types.ObjectId();

function buildUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: ORG_A,
    keycloakId: 'kc-existing',
    email: 'admin@acme.example',
    username: 'admin@acme.example',
    firstName: 'Ada',
    lastName: 'Admin',
    role: AppRole.Admin,
    customRoleId: null,
    save: jest.fn(),
    ...overrides,
  };
}

/** A chainable Mongoose query mock resolving to `value`. */
function query(value: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('UsersService', () => {
  let userModel: any;
  let customRoleModel: any;
  let configService: ConfigService;
  let defaultOrgService: any;
  let service: UsersService;

  beforeEach(() => {
    userModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      estimatedDocumentCount: jest.fn(() => query(0)),
    };
    customRoleModel = { find: jest.fn(() => query([])) };
    configService = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    defaultOrgService = {
      getDefaultOrganizationId: jest.fn().mockResolvedValue(ORG_A),
    };

    service = new UsersService(
      userModel,
      customRoleModel,
      configService,
      defaultOrgService,
      {} as any, // keycloakAdminService
      {} as any, // organizationsService
      {} as any, // otpService
      { log: jest.fn() } as any, // auditService
    );
  });

  describe('getOrProvisionMe — C1: account takeover via email rebinding', () => {
    const attacker: KeycloakJwtPayload = {
      sub: 'kc-attacker',
      email: 'admin@acme.example',
      email_verified: true,
    };

    it('refuses to rebind an existing record to a new Keycloak subject', async () => {
      const victim = buildUserDoc();
      // No user for the attacker's own sub...
      userModel.findOne.mockReturnValueOnce(query(null));
      // ...but the admin's address is already taken.
      userModel.findOne.mockReturnValueOnce(query(victim));

      await expect(service.getOrProvisionMe(attacker)).rejects.toThrow(
        ConflictException,
      );
      expect(victim.save).not.toHaveBeenCalled();
      expect(victim.keycloakId).toBe('kc-existing');
      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('rejects provisioning when email_verified is absent', async () => {
      userModel.findOne.mockReturnValue(query(null));
      const { email_verified: _omitted, ...unverified } = attacker;

      await expect(service.getOrProvisionMe(unverified)).rejects.toThrow(
        ForbiddenException,
      );
      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('rejects provisioning when email_verified is explicitly false', async () => {
      userModel.findOne.mockReturnValue(query(null));

      await expect(
        service.getOrProvisionMe({ ...attacker, email_verified: false }),
      ).rejects.toThrow(ForbiddenException);
      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('resolves an ordinary re-login by sub without touching the email path', async () => {
      const existing = buildUserDoc({ keycloakId: 'kc-existing' });
      userModel.findOne.mockReturnValueOnce(query(existing));

      const result = await service.getOrProvisionMe({
        sub: 'kc-existing',
        email: 'admin@acme.example',
        email_verified: true,
      });

      expect(result.keycloakId).toBe('kc-existing');
      // One lookup only: by sub. findByEmail is never reached.
      expect(userModel.findOne).toHaveBeenCalledTimes(1);
    });

    it('still bootstraps the first Admin on an empty standalone install', async () => {
      userModel.findOne.mockReturnValue(query(null));
      userModel.create.mockResolvedValue(
        buildUserDoc({ keycloakId: 'kc-first' }),
      );

      const result = await service.getOrProvisionMe({
        sub: 'kc-first',
        email: 'owner@acme.example',
        email_verified: true,
        given_name: 'Owner',
        family_name: 'One',
      });

      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'kc-first',
          email: 'owner@acme.example',
          role: AppRole.Admin,
          organizationId: ORG_A,
        }),
      );
      expect(result.keycloakId).toBe('kc-first');
    });

    it('refuses an unprovisioned user once the install has users', async () => {
      userModel.findOne.mockReturnValue(query(null));
      userModel.estimatedDocumentCount.mockReturnValue(query(3));

      await expect(
        service.getOrProvisionMe({
          sub: 'kc-nobody',
          email: 'nobody@acme.example',
          email_verified: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(userModel.create).not.toHaveBeenCalled();
    });
  });

  describe('syncIdentityFields — C1: the email-change path', () => {
    const existing = () => buildUserDoc({ keycloakId: 'kc-mine' });

    it('applies a verified email change', async () => {
      const user = existing();
      userModel.findOne.mockReturnValueOnce(query(user)); // by sub
      userModel.findOne.mockReturnValueOnce(query(null)); // collision check
      userModel.findByIdAndUpdate.mockReturnValue({
        orFail: () => query({ ...user, email: 'new@acme.example' }),
      });

      const result = await service.getOrProvisionMe({
        sub: 'kc-mine',
        email: 'new@acme.example',
        email_verified: true,
      });

      expect(result.email).toBe('new@acme.example');
    });

    it('ignores an unverified email change instead of persisting it', async () => {
      const user = existing();
      userModel.findOne.mockReturnValueOnce(query(user));

      const result = await service.getOrProvisionMe({
        sub: 'kc-mine',
        email: 'attacker-controlled@acme.example',
        email_verified: false,
      });

      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(result.email).toBe('admin@acme.example');
    });

    it('refuses an email change that would collide with another account', async () => {
      const user = existing();
      const victim = buildUserDoc({
        keycloakId: 'kc-victim',
        email: 'victim@acme.example',
      });
      userModel.findOne.mockReturnValueOnce(query(user));
      userModel.findOne.mockReturnValueOnce(query(victim));

      await expect(
        service.getOrProvisionMe({
          sub: 'kc-mine',
          email: 'victim@acme.example',
          email_verified: true,
        }),
      ).rejects.toThrow(ConflictException);
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('still syncs name changes without demanding email verification', async () => {
      const user = existing();
      userModel.findOne.mockReturnValueOnce(query(user));
      userModel.findByIdAndUpdate.mockReturnValue({
        orFail: () => query({ ...user, firstName: 'Adele' }),
      });

      const result = await service.getOrProvisionMe({
        sub: 'kc-mine',
        email: 'admin@acme.example',
        given_name: 'Adele',
      });

      expect(result.firstName).toBe('Adele');
    });
  });

  describe('findAllStaff — C2: cross-tenant staff directory leak', () => {
    it('filters by organizationId', async () => {
      userModel.find.mockReturnValue(query([]));

      await service.findAllStaff(ORG_B);

      expect(userModel.find).toHaveBeenCalledWith({
        organizationId: ORG_B,
        role: { $ne: AppRole.Customer },
      });
    });

    it('carries the tenant filter through the role-name denormalization path', async () => {
      userModel.find.mockReturnValue(
        query([buildUserDoc({ organizationId: ORG_B })]),
      );

      const result = await service.findAllStaffWithRoleNames(ORG_B);

      expect(userModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_B }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findStaffByKeycloakIds — C3: cross-tenant FK injection', () => {
    it('filters by organizationId as well as the requested ids', async () => {
      userModel.find.mockReturnValue(query([]));

      await service.findStaffByKeycloakIds(['kc-1', 'kc-2'], ORG_A);

      expect(userModel.find).toHaveBeenCalledWith({
        organizationId: ORG_A,
        keycloakId: { $in: ['kc-1', 'kc-2'] },
        role: { $ne: AppRole.Customer },
      });
    });

    it('returns nothing for a staff id belonging to another organisation', async () => {
      // The query is scoped, so the other tenant's staff simply does not match.
      userModel.find.mockReturnValue(query([]));

      const result = await service.findStaffByKeycloakIds(
        ['kc-org-b-staff'],
        ORG_A,
      );

      expect(result).toEqual([]);
    });

    it('short-circuits an empty id list without querying', async () => {
      const result = await service.findStaffByKeycloakIds([], ORG_A);
      expect(result).toEqual([]);
      expect(userModel.find).not.toHaveBeenCalled();
    });
  });
});
