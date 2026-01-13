import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as TenantContextServiceModule from '../../../common/services/tenant-context.service';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  let controller: BillingController;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  let stripeService: jest.Mocked<StripeService>;

  const mockTenantId = 'tenant-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: SubscriptionService,
          useValue: {
            getSubscription: jest.fn(),
            createSubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            getOrCreateCustomer: jest.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            createCheckoutSession: jest.fn(),
            createBillingPortalSession: jest.fn(),
            listInvoices: jest.fn(),
            getUpcomingInvoice: jest.fn(),
            listPrices: jest.fn(),
            listProducts: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);
    subscriptionService = module.get(SubscriptionService);
    stripeService = module.get(StripeService);

    // Mock TenantContextService
    jest.spyOn(TenantContextServiceModule.TenantContextService, 'getTenantId').mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSubscription', () => {
    it('should return subscription for tenant', async () => {
      const mockSubscription = { id: 'sub-1', status: 'active' };
      subscriptionService.getSubscription.mockResolvedValue(mockSubscription as any);

      const result = await controller.getSubscription();

      expect(subscriptionService.getSubscription).toHaveBeenCalledWith(mockTenantId);
      expect(result).toEqual(mockSubscription);
    });

    it('should throw BadRequestException when no tenant context', async () => {
      jest.spyOn(TenantContextServiceModule.TenantContextService, 'getTenantId').mockReturnValue(undefined);

      await expect(controller.getSubscription()).rejects.toThrow(BadRequestException);
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription', async () => {
      const dto = { priceId: 'price_123', paymentMethodId: 'pm_123' };
      const mockSubscription = { id: 'sub-1', status: 'active' };
      subscriptionService.createSubscription.mockResolvedValue(mockSubscription as any);

      const result = await controller.createSubscription(dto);

      expect(subscriptionService.createSubscription).toHaveBeenCalledWith(
        mockTenantId,
        dto.priceId,
        dto.paymentMethodId,
      );
      expect(result).toEqual(mockSubscription);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription immediately', async () => {
      const dto = { cancelAtPeriodEnd: false };
      const mockSubscription = { id: 'sub-1', status: 'canceled' };
      subscriptionService.cancelSubscription.mockResolvedValue(mockSubscription as any);

      const result = await controller.cancelSubscription(dto);

      expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith(
        mockTenantId,
        true, // cancelImmediately = !cancelAtPeriodEnd
      );
      expect(result).toEqual(mockSubscription);
    });

    it('should schedule cancellation at period end', async () => {
      const dto = { cancelAtPeriodEnd: true };
      const mockSubscription = { id: 'sub-1', cancelAtPeriodEnd: true };
      subscriptionService.cancelSubscription.mockResolvedValue(mockSubscription as any);

      const result = await controller.cancelSubscription(dto);

      expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith(mockTenantId, false);
      expect(result).toEqual(mockSubscription);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session', async () => {
      const dto = {
        priceId: 'price_123',
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
        allowPromotionCodes: true,
      };
      const mockCustomer = { stripeCustomerId: 'cus_123' };
      const mockSession = { id: 'cs_123', url: 'http://checkout.url' };

      subscriptionService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
      stripeService.createCheckoutSession.mockResolvedValue(mockSession as any);

      const result = await controller.createCheckoutSession(dto);

      expect(subscriptionService.getOrCreateCustomer).toHaveBeenCalledWith(mockTenantId);
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith({
        customer: mockCustomer.stripeCustomerId,
        mode: 'subscription',
        line_items: [{ price: dto.priceId, quantity: 1 }],
        success_url: dto.successUrl,
        cancel_url: dto.cancelUrl,
        allow_promotion_codes: dto.allowPromotionCodes,
      });
      expect(result).toEqual({
        sessionId: 'cs_123',
        url: 'http://checkout.url',
      });
    });
  });

  describe('createPortalSession', () => {
    it('should create billing portal session', async () => {
      const dto = { returnUrl: 'http://return.url' };
      const mockCustomer = { stripeCustomerId: 'cus_123' };
      const mockSession = { url: 'http://portal.url' };

      subscriptionService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
      stripeService.createBillingPortalSession.mockResolvedValue(mockSession as any);

      const result = await controller.createPortalSession(dto);

      expect(stripeService.createBillingPortalSession).toHaveBeenCalledWith({
        customer: mockCustomer.stripeCustomerId,
        return_url: dto.returnUrl,
      });
      expect(result).toEqual({ url: 'http://portal.url' });
    });
  });

  describe('listInvoices', () => {
    it('should list invoices for customer', async () => {
      const mockCustomer = { stripeCustomerId: 'cus_123' };
      const mockInvoices = [{ id: 'in_123' }];

      subscriptionService.getOrCreateCustomer.mockResolvedValue(mockCustomer as any);
      stripeService.listInvoices.mockResolvedValue(mockInvoices as any);

      const result = await controller.listInvoices();

      expect(stripeService.listInvoices).toHaveBeenCalledWith('cus_123');
      expect(result).toEqual(mockInvoices);
    });
  });

  describe('listPrices', () => {
    it('should list available prices', async () => {
      const mockPrices = [{ id: 'price_123' }];
      stripeService.listPrices.mockResolvedValue(mockPrices as any);

      const result = await controller.listPrices();

      expect(stripeService.listPrices).toHaveBeenCalled();
      expect(result).toEqual(mockPrices);
    });
  });

  describe('listProducts', () => {
    it('should list available products', async () => {
      const mockProducts = [{ id: 'prod_123' }];
      stripeService.listProducts.mockResolvedValue(mockProducts as any);

      const result = await controller.listProducts();

      expect(stripeService.listProducts).toHaveBeenCalled();
      expect(result).toEqual(mockProducts);
    });
  });
});
