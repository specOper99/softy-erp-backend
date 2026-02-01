import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Tenant } from '../entities/tenant.entity';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { TenantsService } from '../tenants.service';
import { SubscriptionGuard } from './subscription.guard';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let reflector: Reflector;
  let tenantsService: jest.Mocked<TenantsService>;

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => ({}),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        Reflector,
        {
          provide: TenantsService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<SubscriptionGuard>(SubscriptionGuard);
    reflector = module.get<Reflector>(Reflector);
    tenantsService = module.get(TenantsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when no subscription requirement', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw when no tenant context', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(SubscriptionPlan.PRO);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(undefined);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(BadRequestException);
    });

    it('should throw when tenant not found', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(SubscriptionPlan.PRO);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      tenantsService.findOne.mockResolvedValue(null as unknown as Tenant);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow('Tenant not found');
    });

    it('should allow when tenant has sufficient plan', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(SubscriptionPlan.PRO);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      tenantsService.findOne.mockResolvedValue({
        id: 'tenant-123',
        subscriptionPlan: SubscriptionPlan.PRO,
      } as unknown as Tenant);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should allow when tenant has higher plan', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(SubscriptionPlan.PRO);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      tenantsService.findOne.mockResolvedValue({
        id: 'tenant-123',
        subscriptionPlan: SubscriptionPlan.ENTERPRISE,
      } as unknown as Tenant);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw when tenant has insufficient plan', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(SubscriptionPlan.ENTERPRISE);
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
      tenantsService.findOne.mockResolvedValue({
        id: 'tenant-123',
        subscriptionPlan: SubscriptionPlan.FREE,
      } as unknown as Tenant);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Upgrade to ENTERPRISE to access this feature',
      );
    });
  });
});
