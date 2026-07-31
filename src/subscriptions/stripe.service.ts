import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Optional by design: standalone (Regular License) deployments run with no
 * Stripe keys at all. Every method throws if called without configured keys —
 * that's fine because the SaaS-only call sites (subscriptions controller) are
 * unreachable in standalone mode (SubscriptionGuard short-circuits first).
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    this.stripe = secretKey
      ? new Stripe(secretKey, { apiVersion: '2025-01-27.acpi' as any })
      : null;

    if (!this.stripe) {
      this.logger.warn('STRIPE_SECRET_KEY not set — billing features are disabled.');
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
    }
    return this.stripe;
  }

  async createCustomer(email: string, name: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.requireStripe().customers.create({
        email,
        name,
      });
      this.logger.log(`Created Stripe customer: ${customer.id} for email ${email}`);
      return customer;
    } catch (error) {
      this.logger.error(`Stripe createCustomer failed:`, error);
      throw error;
    }
  }

  async createSubscription(customerId: string, priceId: string, trialDays?: number): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.requireStripe().subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
      });
      this.logger.log(`Created Stripe subscription: ${subscription.id} for customer ${customerId}`);
      return subscription;
    } catch (error) {
      this.logger.error(`Stripe createSubscription failed:`, error);
      throw error;
    }
  }

  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await this.requireStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      this.logger.log(`Created Stripe billing portal session: ${session.url} for customer ${customerId}`);
      return session;
    } catch (error) {
      this.logger.error(`Stripe createBillingPortalSession failed:`, error);
      throw error;
    }
  }

  constructEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new Error('Stripe is not configured (STRIPE_WEBHOOK_SECRET missing).');
    }
    try {
      return this.requireStripe().webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      this.logger.error(`Stripe constructEvent signature verification failed:`, error);
      throw error;
    }
  }
}
