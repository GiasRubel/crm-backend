import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockBillingPortalSessionsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    subscriptions: { create: mockSubscriptionsCreate },
    billingPortal: { sessions: { create: mockBillingPortalSessionsCreate } },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

describe('StripeService', () => {
  const buildConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when Stripe is not configured', () => {
    let service: StripeService;

    beforeEach(() => {
      service = new StripeService(buildConfigService({}));
    });

    it('throws on createCustomer', async () => {
      await expect(service.createCustomer('a@b.com', 'A')).rejects.toThrow(
        'Stripe is not configured',
      );
    });

    it('throws on constructEvent when the webhook secret is missing', () => {
      expect(() => service.constructEvent('body', 'sig')).toThrow(
        'STRIPE_WEBHOOK_SECRET',
      );
    });
  });

  describe('when Stripe is configured', () => {
    let service: StripeService;

    beforeEach(() => {
      service = new StripeService(
        buildConfigService({
          STRIPE_SECRET_KEY: 'sk_test_123',
          STRIPE_WEBHOOK_SECRET: 'whsec_123',
        }),
      );
    });

    it('creates a Stripe customer', async () => {
      mockCustomersCreate.mockResolvedValue({ id: 'cus_1' });

      const result = await service.createCustomer('a@b.com', 'A');

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'a@b.com',
        name: 'A',
      });
      expect(result).toEqual({ id: 'cus_1' });
    });

    it('propagates errors from customer creation', async () => {
      mockCustomersCreate.mockRejectedValue(new Error('stripe down'));

      await expect(service.createCustomer('a@b.com', 'A')).rejects.toThrow(
        'stripe down',
      );
    });

    it('creates a subscription with trial days', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_1' });

      const result = await service.createSubscription('cus_1', 'price_1', 14);

      expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_1',
          items: [{ price: 'price_1' }],
          trial_period_days: 14,
        }),
      );
      expect(result).toEqual({ id: 'sub_1' });
    });

    it('creates a billing portal session', async () => {
      mockBillingPortalSessionsCreate.mockResolvedValue({ url: 'https://portal' });

      const result = await service.createBillingPortalSession(
        'cus_1',
        'https://app/return',
      );

      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://app/return',
      });
      expect(result).toEqual({ url: 'https://portal' });
    });

    it('constructs a webhook event from the signature', () => {
      mockWebhooksConstructEvent.mockReturnValue({ type: 'invoice.paid' });

      const result = service.constructEvent('raw-body', 'sig');

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        'raw-body',
        'sig',
        'whsec_123',
      );
      expect(result).toEqual({ type: 'invoice.paid' });
    });

    it('propagates signature verification errors', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => service.constructEvent('raw-body', 'bad-sig')).toThrow(
        'invalid signature',
      );
    });
  });
});
