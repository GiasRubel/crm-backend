import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../../users/users.service';
import { AppRole } from '../../users/app-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { KeycloakJwtPayload } from '../interfaces/keycloak-jwt-payload.interface';
import type { Types } from 'mongoose';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user: KeycloakJwtPayload;
      organizationId?: Types.ObjectId;
    }>();
    const jwtUser = request.user;

    if (!jwtUser?.sub) {
      throw new ForbiddenException('User not authenticated');
    }

    const appUser = await this.usersService.findByKeycloakId(jwtUser.sub);
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No app User doc yet: only allowed through on unroled routes (e.g.
    // `GET /users/me`, which lazily provisions the doc on first login).
    // Any route requiring specific roles must have a resolved app user.
    if (!appUser) {
      if (requiredRoles?.length) {
        throw new ForbiddenException('No app user record for this account');
      }
      return true;
    }

    // PlatformAdmin (the CRM operator) is cross-org and carries no
    // organizationId — every other role belongs to exactly one organization.
    request.organizationId = appUser.organizationId;

    if (!requiredRoles?.length) {
      return true;
    }

    if (!requiredRoles.includes(appUser.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
