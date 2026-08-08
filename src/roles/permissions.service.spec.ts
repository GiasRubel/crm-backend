import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PermissionsService } from './permissions.service';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let roleModel: { findOne: jest.Mock };
  let usersService: jest.Mocked<UsersService>;
  let teamsService: jest.Mocked<TeamsService>;

  const organizationId = new Types.ObjectId();
  const roleId = new Types.ObjectId();

  beforeEach(() => {
    roleModel = { findOne: jest.fn() };
    usersService = {
      findByKeycloakId: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    teamsService = {
      getTeamIdsForMember: jest.fn(),
    } as unknown as jest.Mocked<TeamsService>;
    service = new PermissionsService(
      roleModel as any,
      usersService,
      teamsService,
    );
  });

  it('rejects when the caller has no app user record', async () => {
    usersService.findByKeycloakId.mockResolvedValue(null);

    await expect(
      service.getEffectivePermission('kc-1', organizationId, 'lead', 'read'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('grants unrestricted access to Admin/Administrator', async () => {
    usersService.findByKeycloakId.mockResolvedValue({
      role: AppRole.Admin,
    } as any);

    const permission = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'lead',
      'delete',
    );

    expect(permission).toEqual({
      allowed: true,
      scope: 'all',
      fieldRestrictions: new Map(),
    });
    expect(roleModel.findOne).not.toHaveBeenCalled();
  });

  it('denies the Customer role, which never reaches this path in practice', async () => {
    usersService.findByKeycloakId.mockResolvedValue({
      role: AppRole.Customer,
    } as any);

    const permission = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'ticket',
      'read',
    );

    expect(permission.allowed).toBe(false);
  });

  it('gives a plain User full CRUD with team-scoped visibility by default', async () => {
    usersService.findByKeycloakId.mockResolvedValue({
      role: AppRole.User,
      customRoleId: null,
    } as any);

    const permission = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'lead',
      'update',
    );

    expect(permission.allowed).toBe(true);
    expect(permission.scope).toBe('team');
  });

  it('fails closed when a User references a deleted custom role', async () => {
    usersService.findByKeycloakId.mockResolvedValue({
      role: AppRole.User,
      customRoleId: roleId,
    } as any);
    roleModel.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });

    const permission = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'lead',
      'read',
    );

    expect(permission.allowed).toBe(false);
  });

  it('resolves allowed actions/scope from the custom role for a matching entity', async () => {
    usersService.findByKeycloakId.mockResolvedValue({
      role: AppRole.User,
      customRoleId: roleId,
    } as any);
    roleModel.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          permissions: [
            { entityType: 'lead', actions: ['read', 'update'], scope: 'own' },
          ],
          fieldRestrictions: [
            {
              entityType: 'lead',
              fieldKey: 'ssn',
              hidden: true,
              readonly: false,
            },
          ],
        }),
    });

    const readable = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'lead',
      'read',
    );
    const deletable = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'lead',
      'delete',
    );

    expect(readable).toEqual({
      allowed: true,
      scope: 'own',
      fieldRestrictions: new Map([['ssn', { hidden: true, readonly: false }]]),
    });
    expect(deletable.allowed).toBe(false);
  });

  it('denies actions on entity types absent from the custom role matrix', async () => {
    usersService.findByKeycloakId.mockResolvedValue({
      role: AppRole.User,
      customRoleId: roleId,
    } as any);
    roleModel.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          permissions: [
            { entityType: 'lead', actions: ['read'], scope: 'all' },
          ],
          fieldRestrictions: [],
        }),
    });

    const permission = await service.getEffectivePermission(
      'kc-1',
      organizationId,
      'ticket',
      'read',
    );

    expect(permission.allowed).toBe(false);
  });

  describe('requirePermission', () => {
    it('throws ForbiddenException when the resolved permission is disallowed', async () => {
      usersService.findByKeycloakId.mockResolvedValue({
        role: AppRole.Customer,
      } as any);

      await expect(
        service.requirePermission('kc-1', organizationId, 'lead', 'read'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('buildVisibilityFilter', () => {
    it('returns null for scope "all"', () => {
      expect(service.buildVisibilityFilter('all', 'kc-1', [])).toBeNull();
    });

    it('restricts to own records for scope "own"', () => {
      const filter = service.buildVisibilityFilter('own', 'kc-1', []);
      expect(filter).toEqual({
        $or: [{ assignedToId: 'kc-1' }, { createdBy: 'kc-1' }],
      });
    });

    it('includes team ids for scope "team"', () => {
      const teamId = new Types.ObjectId();
      const filter = service.buildVisibilityFilter('team', 'kc-1', [teamId]);
      expect(filter).toEqual({
        $or: [
          { assignedToId: 'kc-1' },
          { assignedTeamId: { $in: [teamId] } },
          { createdBy: 'kc-1' },
        ],
      });
    });
  });

  describe('isRecordInScope', () => {
    it('always allows scope "all"', async () => {
      await expect(
        service.isRecordInScope('all', 'kc-1', organizationId, {}),
      ).resolves.toBe(true);
    });

    it('allows own records regardless of scope', async () => {
      await expect(
        service.isRecordInScope('own', 'kc-1', organizationId, {
          assignedToId: 'kc-1',
        }),
      ).resolves.toBe(true);
    });

    it('rejects a record outside scope "own" even if it is team-routed', async () => {
      const teamId = new Types.ObjectId();
      await expect(
        service.isRecordInScope('own', 'kc-2', organizationId, {
          assignedToId: 'kc-1',
          assignedTeamId: teamId,
        }),
      ).resolves.toBe(false);
    });

    it('allows a team-routed record for scope "team" when the caller is a member', async () => {
      const teamId = new Types.ObjectId();
      teamsService.getTeamIdsForMember.mockResolvedValue([teamId]);

      await expect(
        service.isRecordInScope('team', 'kc-2', organizationId, {
          assignedToId: 'kc-1',
          assignedTeamId: teamId,
        }),
      ).resolves.toBe(true);
    });
  });

  describe('field restriction helpers', () => {
    it('strips hidden fields from a value map', () => {
      const result = service.applyFieldVisibility(
        { name: 'Acme', ssn: '123' },
        new Map([['ssn', { hidden: true, readonly: false }]]),
      );
      expect(result).toEqual({ name: 'Acme' });
    });

    it('reverts attempted changes to read-only fields', () => {
      const result = service.stripReadonlyFieldChanges(
        { tier: 'gold' },
        { tier: 'platinum', notes: 'updated' },
        new Map([['tier', { hidden: false, readonly: true }]]),
      );
      expect(result).toEqual({ tier: 'gold', notes: 'updated' });
    });

    it('drops a read-only field with no prior value instead of admitting it', () => {
      const result = service.stripReadonlyFieldChanges(
        undefined,
        { tier: 'platinum' },
        new Map([['tier', { hidden: false, readonly: true }]]),
      );
      expect(result).toEqual({});
    });
  });
});
