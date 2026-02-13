import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { BillingCustomer } from '../entities/billing-customer.entity';
import { BillingWebhookEvent } from '../entities/billing-webhook-event.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription, SubscriptionStatus } from '../entities/subscription.entity';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepo: jest.Mocked<Repository<Subscription>>;
  let customerRepo: jest.Mocked<Repository<BillingCustomer>>;
  let webhookEventRepo: jest.Mocked<Repository<BillingWebhookEvent>>;
  let tenantRepo: jest.Mocked<Repository<Tenant>>;
  let stripeService: jest.Mocked<StripeService>;

  const mockTenantId = 'tenant-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: getRepositoryToken(Subscription),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BillingCustomer),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethod),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BillingWebhookEvent),
          useValue: {
            create: jest.fn(),
            insert: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            createCustomer: jest.fn(),
            createSubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            updateSubscription: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    subscriptionRepo = module.get(getRepositoryToken(Subscription));
    customerRepo = module.get(getRepositoryToken(BillingCustomer));
    webhookEventRepo = module.get(getRepositoryToken(BillingWebhookEvent));
    tenantRepo = module.get(getRepositoryToken(Tenant));
    stripeService = module.get(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateCustomer', () => {
    it('should return existing customer', async () => {
      const mockCustomer = { id: 'cust-1', tenantId: mockTenantId };
      customerRepo.findOne.mockResolvedValue(mockCustomer as unknown as BillingCustomer);

      const result = await service.getOrCreateCustomer(mockTenantId);

      expect(customerRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
      });
      expect(result).toEqual(mockCustomer);
    });

    it('should create new customer if not exists', async () => {
      const mockTenant = {
        id: mockTenantId,
        name: 'Test Tenant',
        slug: 'test',
      };
      const mockStripeCustomer = { id: 'cus_123' };
      const mockNewCustomer = { id: 'cust-1', stripeCustomerId: 'cus_123' };

      customerRepo.findOne.mockResolvedValue(null);
      tenantRepo.findOne.mockResolvedValue(mockTenant as unknown as Tenant);
      stripeService.createCustomer.mockResolvedValue(mockStripeCustomer as unknown as Stripe.Customer);
      customerRepo.create.mockReturnValue(mockNewCustomer as unknown as BillingCustomer);
      customerRepo.save.mockResolvedValue(mockNewCustomer as unknown as BillingCustomer);

      const result = await service.getOrCreateCustomer(mockTenantId);

      expect(stripeService.createCustomer).toHaveBeenCalledWith({
        name: mockTenant.name,
        metadata: { tenantId: mockTenant.id, tenantSlug: mockTenant.slug },
      });
      expect(result).toEqual(mockNewCustomer);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.getOrCreateCustomer(mockTenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSubscription', () => {
    it('should return subscription for tenant', async () => {
      const mockSubscription = { id: 'sub-1', tenantId: mockTenantId };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as unknown as Subscription);

      const result = await service.getSubscription(mockTenantId);

      expect(subscriptionRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
      });
      expect(result).toEqual(mockSubscription);
    });

    it('should return null when no subscription exists', async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);

      const result = await service.getSubscription(mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('createSubscription', () => {
    it('should throw BadRequestException if active subscription exists', async () => {
      const mockCustomer = { stripeCustomerId: 'cus_123' };
      const mockExistingSub = { isActive: () => true };

      customerRepo.findOne.mockResolvedValue(mockCustomer as unknown as BillingCustomer);
      subscriptionRepo.findOne.mockResolvedValue(mockExistingSub as unknown as Subscription);

      await expect(service.createSubscription(mockTenantId, 'price_123')).rejects.toThrow(BadRequestException);
    });

    it('should create subscription and update tenant plan', async () => {
      const mockCustomer = { tenantId: mockTenantId, stripeCustomerId: 'cus_123' };
      customerRepo.findOne.mockResolvedValue(mockCustomer as unknown as BillingCustomer);
      subscriptionRepo.findOne.mockResolvedValue(null);

      const stripeSubscription = {
        id: 'sub_stripe_123',
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              quantity: 1,
              price: { id: 'price_pro_123', recurring: { interval: 'month' } },
            },
          ],
        },
        current_period_start: 1700000000,
        current_period_end: 1700003600,
      } as unknown as Stripe.Subscription;

      stripeService.createSubscription.mockResolvedValue(stripeSubscription);

      const created = {
        tenantId: mockTenantId,
        stripeSubscriptionId: 'sub_stripe_123',
        stripeCustomerId: 'cus_123',
        stripePriceId: 'price_pro_123',
        status: SubscriptionStatus.ACTIVE,
      };

      subscriptionRepo.create.mockReturnValue(created as unknown as Subscription);
      subscriptionRepo.save.mockResolvedValue(created as unknown as Subscription);

      const result = await service.createSubscription(mockTenantId, 'price_pro_123');

      expect(stripeService.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          items: [{ price: 'price_pro_123' }],
          expand: ['latest_invoice.payment_intent'],
        }),
      );

      expect(subscriptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          stripeSubscriptionId: 'sub_stripe_123',
          stripeCustomerId: 'cus_123',
          stripePriceId: 'price_pro_123',
          status: SubscriptionStatus.ACTIVE,
        }),
      );

      expect(tenantRepo.update).toHaveBeenCalledWith(mockTenantId, { subscriptionPlan: SubscriptionPlan.PRO });
      expect(result).toEqual(created);
    });
  });

  describe('cancelSubscription', () => {
    it('should throw NotFoundException when no subscription found', async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);

      await expect(service.cancelSubscription(mockTenantId)).rejects.toThrow(NotFoundException);
    });

    it('should cancel immediately when specified', async () => {
      const mockSubscription = {
        stripeSubscriptionId: 'sub_123',
        status: SubscriptionStatus.ACTIVE,
      };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as unknown as Subscription);
      subscriptionRepo.save.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.CANCELED,
      } as unknown as Subscription);

      const result = await service.cancelSubscription(mockTenantId, true);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_123');
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('should schedule cancellation at period end', async () => {
      const mockSubscription = {
        stripeSubscriptionId: 'sub_123',
        cancelAtPeriodEnd: false,
      };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as unknown as Subscription);
      subscriptionRepo.save.mockResolvedValue({
        ...mockSubscription,
        cancelAtPeriodEnd: true,
      } as unknown as Subscription);

      const result = await service.cancelSubscription(mockTenantId, false);

      expect(stripeService.updateSubscription).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: true,
      });
      expect(result.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should skip duplicate events', async () => {
      const mockEvent = {
        id: 'evt_duplicate',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_123' } },
      } as unknown as Stripe.Event;

      webhookEventRepo.create.mockReturnValue({
        provider: 'stripe',
        eventId: mockEvent.id,
      } as unknown as BillingWebhookEvent);
      webhookEventRepo.insert.mockRejectedValue({ code: '23505' });

      await service.handleWebhookEvent(mockEvent);

      expect(subscriptionRepo.findOne).not.toHaveBeenCalled();
      expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });

    it('should handle expanded subscription object in invoice', async () => {
      const mockInvoice = {
        subscription: { id: 'sub_123' },
      };
      const mockEvent = {
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: { object: mockInvoice },
      } as unknown as Stripe.Event;

      webhookEventRepo.create.mockReturnValue({
        provider: 'stripe',
        eventId: mockEvent.id,
      } as unknown as BillingWebhookEvent);
      webhookEventRepo.insert.mockResolvedValue({} as never);

      const mockSubscription = { id: 'sub-db-1', status: SubscriptionStatus.PAST_DUE };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as unknown as Subscription);
      subscriptionRepo.save.mockResolvedValue(mockSubscription as unknown as Subscription);

      await service.handleWebhookEvent(mockEvent);

      expect(subscriptionRepo.findOne).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_123' },
      });
      expect(subscriptionRepo.save).toHaveBeenCalled();
    });

    it('should safely handle missing period dates in subscription update', async () => {
      const mockStripeSub = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_123' } }] },
      };
      const mockEvent = {
        id: 'evt_456',
        type: 'customer.subscription.updated',
        data: { object: mockStripeSub },
      } as unknown as Stripe.Event;

      webhookEventRepo.create.mockReturnValue({
        provider: 'stripe',
        eventId: mockEvent.id,
      } as unknown as BillingWebhookEvent);
      webhookEventRepo.insert.mockResolvedValue({} as never);

      customerRepo.findOne.mockResolvedValue({ tenantId: 'tenant-1' } as unknown as BillingCustomer);
      subscriptionRepo.findOne.mockResolvedValue({
        stripeSubscriptionId: 'sub_123',
        status: SubscriptionStatus.ACTIVE,
      } as unknown as Subscription);

      await service.handleWebhookEvent(mockEvent);

      expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });
  });
});
