import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { BillingCustomer } from '../entities/billing-customer.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../entities/subscription.entity';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepo: jest.Mocked<Repository<Subscription>>;
  let customerRepo: jest.Mocked<Repository<BillingCustomer>>;
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
    tenantRepo = module.get(getRepositoryToken(Tenant));
    stripeService = module.get(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateCustomer', () => {
    it('should return existing customer', async () => {
      const mockCustomer = { id: 'cust-1', tenantId: mockTenantId };
      customerRepo.findOne.mockResolvedValue(mockCustomer as any);

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
      tenantRepo.findOne.mockResolvedValue(mockTenant as any);
      stripeService.createCustomer.mockResolvedValue(mockStripeCustomer as any);
      customerRepo.create.mockReturnValue(mockNewCustomer as any);
      customerRepo.save.mockResolvedValue(mockNewCustomer as any);

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

      await expect(service.getOrCreateCustomer(mockTenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSubscription', () => {
    it('should return subscription for tenant', async () => {
      const mockSubscription = { id: 'sub-1', tenantId: mockTenantId };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as any);

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

      customerRepo.findOne.mockResolvedValue(mockCustomer as any);
      subscriptionRepo.findOne.mockResolvedValue(mockExistingSub as any);

      await expect(
        service.createSubscription(mockTenantId, 'price_123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelSubscription', () => {
    it('should throw NotFoundException when no subscription found', async () => {
      subscriptionRepo.findOne.mockResolvedValue(null);

      await expect(service.cancelSubscription(mockTenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should cancel immediately when specified', async () => {
      const mockSubscription = {
        stripeSubscriptionId: 'sub_123',
        status: SubscriptionStatus.ACTIVE,
      };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as any);
      subscriptionRepo.save.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.CANCELED,
      } as any);

      const result = await service.cancelSubscription(mockTenantId, true);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_123');
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('should schedule cancellation at period end', async () => {
      const mockSubscription = {
        stripeSubscriptionId: 'sub_123',
        cancelAtPeriodEnd: false,
      };
      subscriptionRepo.findOne.mockResolvedValue(mockSubscription as any);
      subscriptionRepo.save.mockResolvedValue({
        ...mockSubscription,
        cancelAtPeriodEnd: true,
      } as any);

      const result = await service.cancelSubscription(mockTenantId, false);

      expect(stripeService.updateSubscription).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: true,
      });
      expect(result.cancelAtPeriodEnd).toBe(true);
    });
  });
});
