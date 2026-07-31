import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from '../subscriptions.service';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { IS_BILLING_EXEMPT_KEY } from '../../auth/decorators/billing-exempt.decorator';
import { AppRole } from '../../users/app-role.enum';
import { SUBSCRIPTION_ACTIVE_STATUSES } from '../subscription.schema';
import { UsersService } from '../../users/users.service';
import {
  DeploymentMode,
  getDeploymentMode,
} from '../../config/deployment-mode';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Regular License (standalone) deployments have no billing to enforce.
    if (getDeploymentMode(this.configService) === DeploymentMode.Standalone) {
      return true;
    }

    // 1. Skip entirely for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // 2. Skip entirely for billing exempt routes
    const isBillingExempt = this.reflector.getAllAndOverride<boolean>(
      IS_BILLING_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isBillingExempt) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user;
    if (!jwtUser?.sub) {
      return true; // Let authentication guards handle lack of credentials
    }

    const appUser = await this.usersService.findByKeycloakId(jwtUser.sub);
    if (!appUser) {
      return true; // Let RolesGuard handle missing app user
    }

    // 3. Skip entirely for PlatformAdmin callers (cross-org)
    if (appUser.role === AppRole.PlatformAdmin) {
      return true;
    }

    // 4. Allow GET/HEAD/OPTIONS always (read-only)
    const method = request.method;
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // 5. Check subscription status
    const orgId = request.organizationId;
    if (!orgId) {
      throw new HttpException(
        'Organization context missing',
        HttpStatus.BAD_REQUEST,
      );
    }

    const subscription =
      await this.subscriptionsService.findDocByOrganizationId(orgId);
    if (!subscription) {
      throw new HttpException(
        'Subscription not found for organization',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (SUBSCRIPTION_ACTIVE_STATUSES.includes(subscription.status)) {
      return true;
    }

    throw new HttpException(
      'Subscription inactive — read-only until payment resolves',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
