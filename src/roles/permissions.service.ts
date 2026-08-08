import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TeamsService } from '../teams/teams.service';
import { AppRole } from '../users/app-role.enum';
import { UsersService } from '../users/users.service';
import { CustomRole, CustomRoleDocument } from './custom-role.schema';
import {
  PERMISSION_ACTIONS,
  PERMISSION_ENTITY_TYPES,
  PermissionAction,
  PermissionEntityType,
  PermissionScope,
} from './custom-role.schema';

export interface FieldRestrictionInfo {
  hidden: boolean;
  readonly: boolean;
}

export interface EffectivePermission {
  allowed: boolean;
  scope: PermissionScope;
  /** fieldKey → restriction, scoped to the entityType this was resolved for. */
  fieldRestrictions: Map<string, FieldRestrictionInfo>;
}

const FULL_ACCESS: EffectivePermission = {
  allowed: true,
  scope: 'all',
  fieldRestrictions: new Map(),
};

const NO_ACCESS = (scope: PermissionScope = 'own'): EffectivePermission => ({
  allowed: false,
  scope,
  fieldRestrictions: new Map(),
});

/**
 * Central authority for "can this staff member do X to this entity type, and
 * what should they be allowed to see." Admin/Administrator/PlatformAdmin
 * always get full, unrestricted access. A plain AppRole.User with no
 * customRoleId gets the legacy default (full CRUD, team-scoped visibility) —
 * the behavior every entity service had before custom roles existed. A User
 * with a customRoleId has both access and visibility governed by that role's
 * permission matrix instead.
 */
@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(CustomRole.name)
    private readonly roleModel: Model<CustomRoleDocument>,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
  ) {}

  async getEffectivePermission(
    keycloakId: string,
    organizationId: Types.ObjectId,
    entityType: PermissionEntityType,
    action: PermissionAction,
  ): Promise<EffectivePermission> {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    if (!appUser) {
      throw new ForbiddenException('No app user record for this account');
    }

    if (
      appUser.role === AppRole.Admin ||
      appUser.role === AppRole.Administrator ||
      appUser.role === AppRole.PlatformAdmin
    ) {
      return FULL_ACCESS;
    }

    if (appUser.role === AppRole.Customer) {
      // Customer-portal endpoints never go through this path.
      return NO_ACCESS();
    }

    if (!appUser.customRoleId) {
      return { allowed: true, scope: 'team', fieldRestrictions: new Map() };
    }

    const role = await this.roleModel
      .findOne({ _id: appUser.customRoleId, organizationId })
      .exec();
    // Dangling reference (role deleted out from under the user) — fail closed.
    if (!role) return NO_ACCESS();

    const entry = role.permissions.find((p) => p.entityType === entityType);
    const fieldRestrictions = new Map<string, FieldRestrictionInfo>(
      role.fieldRestrictions
        .filter((f) => f.entityType === entityType)
        .map((f) => [f.fieldKey, { hidden: f.hidden, readonly: f.readonly }]),
    );

    return {
      allowed: entry?.actions.includes(action) ?? false,
      scope: entry?.scope ?? 'own',
      fieldRestrictions,
    };
  }

  /** Throws ForbiddenException when disallowed; otherwise returns the permission. */
  async requirePermission(
    keycloakId: string,
    organizationId: Types.ObjectId,
    entityType: PermissionEntityType,
    action: PermissionAction,
  ): Promise<EffectivePermission> {
    const permission = await this.getEffectivePermission(
      keycloakId,
      organizationId,
      entityType,
      action,
    );
    if (!permission.allowed) {
      throw new ForbiddenException(
        `You do not have permission to ${action} ${entityType} records`,
      );
    }
    return permission;
  }

  /**
   * The caller's full entity × action/scope matrix — used by the frontend to
   * gate CRUD affordances (buttons, columns) without a round trip per entity.
   */
  async getEffectiveMatrix(
    keycloakId: string,
    organizationId: Types.ObjectId,
  ): Promise<
    Record<
      PermissionEntityType,
      { actions: PermissionAction[]; scope: PermissionScope }
    >
  > {
    const appUser = await this.usersService.findByKeycloakId(keycloakId);
    if (!appUser) {
      throw new ForbiddenException('No app user record for this account');
    }

    const fullAccess =
      appUser.role === AppRole.Admin ||
      appUser.role === AppRole.Administrator ||
      appUser.role === AppRole.PlatformAdmin;

    if (fullAccess || !appUser.customRoleId) {
      const scope: PermissionScope = fullAccess ? 'all' : 'team';
      const entry = { actions: [...PERMISSION_ACTIONS], scope };
      return Object.fromEntries(
        PERMISSION_ENTITY_TYPES.map((entityType) => [entityType, entry]),
      ) as Record<PermissionEntityType, typeof entry>;
    }

    if (appUser.role === AppRole.Customer) {
      const entry = { actions: [], scope: 'own' as PermissionScope };
      return Object.fromEntries(
        PERMISSION_ENTITY_TYPES.map((entityType) => [entityType, entry]),
      ) as Record<PermissionEntityType, typeof entry>;
    }

    const role = await this.roleModel
      .findOne({ _id: appUser.customRoleId, organizationId })
      .exec();
    return Object.fromEntries(
      PERMISSION_ENTITY_TYPES.map((entityType) => {
        const match = role?.permissions.find(
          (p) => p.entityType === entityType,
        );
        return [
          entityType,
          { actions: match?.actions ?? [], scope: match?.scope ?? 'own' },
        ];
      }),
    ) as Record<
      PermissionEntityType,
      { actions: PermissionAction[]; scope: PermissionScope }
    >;
  }

  /** Row-level Mongo filter for the given scope. null = unrestricted (scope 'all'). */
  buildVisibilityFilter(
    scope: PermissionScope,
    keycloakId: string,
    teamIds: Types.ObjectId[],
  ): Record<string, unknown> | null {
    if (scope === 'all') return null;
    if (scope === 'own') {
      return { $or: [{ assignedToId: keycloakId }, { createdBy: keycloakId }] };
    }
    return {
      $or: [
        { assignedToId: keycloakId },
        { assignedTeamId: { $in: teamIds } },
        { createdBy: keycloakId },
      ],
    };
  }

  /** Whether a specific already-loaded record falls within the caller's scope. */
  async isRecordInScope(
    scope: PermissionScope,
    keycloakId: string,
    organizationId: Types.ObjectId,
    record: {
      assignedToId?: string;
      assignedTeamId?: Types.ObjectId;
      createdBy?: string;
    },
  ): Promise<boolean> {
    if (scope === 'all') return true;
    if (record.assignedToId === keycloakId || record.createdBy === keycloakId) {
      return true;
    }
    if (scope === 'team' && record.assignedTeamId) {
      const teamIds = await this.teamsService.getTeamIdsForMember(
        keycloakId,
        organizationId,
      );
      return teamIds.some((teamId) => teamId.equals(record.assignedTeamId));
    }
    return false;
  }

  /** Strip hidden custom-field keys from a value map (used on read). */
  applyFieldVisibility(
    customFields: Record<string, unknown> | undefined,
    fieldRestrictions: Map<string, FieldRestrictionInfo>,
  ): Record<string, unknown> | undefined {
    if (!customFields || fieldRestrictions.size === 0) return customFields;
    const result: Record<string, unknown> = { ...customFields };
    for (const [key, restriction] of fieldRestrictions) {
      if (restriction.hidden) delete result[key];
    }
    return result;
  }

  /** Drop attempted changes to read-only custom-field keys (used on write). */
  stripReadonlyFieldChanges(
    existing: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>,
    fieldRestrictions: Map<string, FieldRestrictionInfo>,
  ): Record<string, unknown> {
    if (fieldRestrictions.size === 0) return incoming;
    const result: Record<string, unknown> = { ...incoming };
    for (const [key, restriction] of fieldRestrictions) {
      if (restriction.readonly && key in result) {
        if (existing && key in existing) {
          result[key] = existing[key];
        } else {
          delete result[key];
        }
      }
    }
    return result;
  }
}
