import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * The caller's organizationId, resolved by RolesGuard from their Mongo User
 * doc. Undefined for PlatformAdmin (cross-org) and for callers with no app
 * user record yet.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Types.ObjectId | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ organizationId?: Types.ObjectId }>();
    return request.organizationId;
  },
);
