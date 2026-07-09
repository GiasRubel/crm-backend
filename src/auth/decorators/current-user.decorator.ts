import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { KeycloakJwtPayload } from '../interfaces/keycloak-jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): KeycloakJwtPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: KeycloakJwtPayload }>();
    return request.user;
  },
);
