import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Tries the Keycloak/JWKS strategy first, then the DB-backed local-auth
// strategy — whichever verifies the bearer token wins. Everything downstream
// (RolesGuard, org scoping, feature services) only cares about the resulting
// `{ sub, email }` shape, not which strategy produced it.
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'local-jwt']) {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
