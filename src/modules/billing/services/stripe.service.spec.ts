import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

describe('StripeService', () => {
  let service: StripeService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should not initialize Stripe when secret key is missing', () => {
      configService.get.mockReturnValue(undefined);

      service.onModuleInit();

      expect(service.isConfigured()).toBe(false);
      expect(service.getClient()).toBeNull();
    });

    it('should initialize Stripe when secret key is provided', () => {
      configService.get.mockReturnValue('sk_test_1234567890');

      service.onModuleInit();

      expect(service.isConfigured()).toBe(true);
      expect(service.getClient()).not.toBeNull();
    });
  });

  describe('isConfigured', () => {
    it('should return false when Stripe not initialized', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('should return true when Stripe is initialized', () => {
      configService.get.mockReturnValue('sk_test_1234567890');
      service.onModuleInit();

      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('getClient', () => {
    it('should return null when not configured', () => {
      expect(service.getClient()).toBeNull();
    });

    it('should return Stripe instance when configured', () => {
      configService.get.mockReturnValue('sk_test_1234567890');
      service.onModuleInit();

      const client = service.getClient();
      expect(client).not.toBeNull();
    });
  });

  // Note: The following tests require actual Stripe API calls
  // They are included as placeholders for integration testing
  describe('API methods (when configured)', () => {
    beforeEach(() => {
      configService.get.mockReturnValue('sk_test_1234567890');
      service.onModuleInit();
    });

    it('should have createCustomer method', () => {
      expect(typeof service.createCustomer).toBe('function');
    });

    it('should have createSubscription method', () => {
      expect(typeof service.createSubscription).toBe('function');
    });

    it('should have cancelSubscription method', () => {
      expect(typeof service.cancelSubscription).toBe('function');
    });

    it('should have createCheckoutSession method', () => {
      expect(typeof service.createCheckoutSession).toBe('function');
    });

    it('should have listInvoices method', () => {
      expect(typeof service.listInvoices).toBe('function');
    });

    it('should have listPrices method', () => {
      expect(typeof service.listPrices).toBe('function');
    });

    it('should have listProducts method', () => {
      expect(typeof service.listProducts).toBe('function');
    });

    it('should have constructWebhookEvent method', () => {
      expect(typeof service.constructWebhookEvent).toBe('function');
    });
  });

  describe('API wrappers', () => {
    it('should throw and warn only once when Stripe is not configured', async () => {
      const warnSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'warn');

      await expect(service.createCustomer({ name: 'Test' })).rejects.toThrow('Stripe is not configured');
      await expect(service.createCustomer({ name: 'Test 2' })).rejects.toThrow('Stripe is not configured');

      // First call warns about missing config (second call does not)
      expect(warnSpy).toHaveBeenCalledWith('Stripe client requested but STRIPE_SECRET_KEY is not configured');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should delegate createCustomer to Stripe client', async () => {
      const customer = { id: 'cus_123' } as unknown as Stripe.Customer;
      const stripeMock = {
        customers: {
          create: jest.fn().mockResolvedValue(customer),
        },
      };

      (service as unknown as { stripe: Stripe | null }).stripe = stripeMock as unknown as Stripe;

      const result = await service.createCustomer({ name: 'Test' });

      expect(stripeMock.customers.create).toHaveBeenCalledWith({ name: 'Test' });
      expect(result).toBe(customer);
    });

    it('should delegate constructWebhookEvent to Stripe client', () => {
      const event = {
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: { object: {} },
      } as unknown as Stripe.Event;
      const stripeMock = {
        webhooks: {
          constructEvent: jest.fn().mockReturnValue(event),
        },
      };

      (service as unknown as { stripe: Stripe | null }).stripe = stripeMock as unknown as Stripe;

      const payload = Buffer.from('{}');
      const result = service.constructWebhookEvent(payload, 'sig', 'whsec_test');

      expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(payload, 'sig', 'whsec_test');
      expect(result).toBe(event);
    });
  });
});
