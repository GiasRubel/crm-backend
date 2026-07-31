import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  NotFoundException,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../users/app-role.enum';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Types } from 'mongoose';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { BillingExempt } from '../auth/decorators/billing-exempt.decorator';

/**
 * Manual, owner-managed billing for now (no public checkout). Stripe
 * webhook/portal endpoints are added in a later phase.
 */
@Controller('subscriptions')
@Roles(AppRole.PlatformAdmin)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  @Get('me')
  @Roles(AppRole.User, AppRole.Admin, AppRole.Administrator)
  async getMySubscription(@CurrentOrg() organizationId: Types.ObjectId) {
    if (!organizationId) {
      throw new NotFoundException('Organization context missing');
    }
    const sub = await this.subscriptionsService.findDocByOrganizationId(organizationId);
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }
    return {
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }

  @Post('portal-session')
  @Roles(AppRole.Admin)
  @BillingExempt()
  async createPortalSession(@CurrentOrg() organizationId: Types.ObjectId) {
    if (!organizationId) {
      throw new NotFoundException('Organization context missing');
    }
    const sub = await this.subscriptionsService.findDocByOrganizationId(organizationId);
    if (!sub || !sub.stripeCustomerId) {
      throw new NotFoundException('Subscription or Stripe Customer not found');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const session = await this.stripeService.createBillingPortalSession(
      sub.stripeCustomerId,
      `${frontendUrl}/dashboard`,
    );

    return { url: session.url };
  }

  @Post('webhook')
  @Public()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // req.body is raw request body buffer
    const event = this.stripeService.constructEvent(req.body, signature);

    switch (event.type) {
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined;
        await this.subscriptionsService.updateByStripeSubscriptionId(sub.id, {
          status: sub.status,
          currentPeriodEnd: periodEnd,
          planId: sub.items?.data?.[0]?.price?.id,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        await this.subscriptionsService.updateByStripeSubscriptionId(sub.id, {
          status: 'canceled',
        });
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        if (typeof invoice.subscription === 'string') {
          await this.subscriptionsService.updateByStripeSubscriptionId(invoice.subscription, {
            status: 'past_due',
          });
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as any;
        if (typeof invoice.subscription === 'string') {
          await this.subscriptionsService.updateByStripeSubscriptionId(invoice.subscription, {
            status: 'active',
          });
        }
        break;
      }
    }

    return { received: true };
  }

  @Post()
  create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(dto);
  }

  @Get('organization/:organizationId')
  findByOrganization(@Param('organizationId') organizationId: string) {
    return this.subscriptionsService.findByOrganizationId(organizationId);
  }

  @Patch('organization/:organizationId')
  update(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(organizationId, dto);
  }
}
