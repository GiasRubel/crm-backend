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
import { KeycloakJwtPayload } from '../interfaces/keycloak-jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user: KeycloakJwtPayload;
    }>();
    const jwtUser = request.user;

    if (!jwtUser?.sub) {
      throw new ForbiddenException('User not authenticated');
    }

    const appUser = await this.usersService.findByKeycloakId(jwtUser.sub);

    if (!appUser || !requiredRoles.includes(appUser.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
