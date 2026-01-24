import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import { TenantLifecycleEvent } from '../entities/tenant-lifecycle-event.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTenantService } from './platform-tenant.service';

describe('PlatformTenantService', () => {
  let service: PlatformTenantService;
  let tenantRepository: jest.Mocked<Repository<Tenant>>;
  let lifecycleEventRepository: jest.Mocked<Repository<TenantLifecycleEvent>>;
  let auditService: jest.Mocked<PlatformAuditService>;
  let cacheUtils: jest.Mocked<CacheUtilsService>;

  const platformUserId = 'platform-user-123';
  const ipAddress = '192.168.1.100';

  const mockTenant: Partial<Tenant> = {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    status: TenantStatus.ACTIVE,
    subscriptionPlan: SubscriptionPlan.PRO,
    billingEmail: 'billing@test.com',
    riskScore: 15,
    suspendedAt: null,
    suspendedBy: null,
    suspensionReason: null,
    gracePeriodEndsAt: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };

  const createMockQueryBuilder = () => ({
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(1),
    getMany: jest.fn().mockResolvedValue([mockTenant]),
  });

  beforeEach(async () => {
    const mockTenantRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockLifecycleEventRepository = {
      save: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockCacheUtilsService = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformTenantService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockTenantRepository,
        },
        {
          provide: getRepositoryToken(TenantLifecycleEvent),
          useValue: mockLifecycleEventRepository,
        },
        {
          provide: PlatformAuditService,
          useValue: mockAuditService,
        },
        {
          provide: CacheUtilsService,
          useValue: mockCacheUtilsService,
        },
      ],
    }).compile();

    service = module.get<PlatformTenantService>(PlatformTenantService);
    tenantRepository = module.get(getRepositoryToken(Tenant));
    lifecycleEventRepository = module.get(getRepositoryToken(TenantLifecycleEvent));
    auditService = module.get(PlatformAuditService);
    cacheUtils = module.get(CacheUtilsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listTenants', () => {
    it('should return tenants with pagination', async () => {
      const mockQb = createMockQueryBuilder();
      tenantRepository.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Tenant>);

      const result = await service.listTenants({ limit: 20, offset: 0 });

      expect(result).toHaveProperty('tenants');
      expect(result).toHaveProperty('total', 1);
      expect(mockQb.take).toHaveBeenCalledWith(20);
      expect(mockQb.skip).toHaveBeenCalledWith(0);
    });

    it('should filter by search term', async () => {
      const mockQb = createMockQueryBuilder();
      tenantRepository.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Tenant>);

      await service.listTenants({ search: 'test' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { search: '%test%' });
    });

    it('should filter by status', async () => {
      const mockQb = createMockQueryBuilder();
      tenantRepository.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Tenant>);

      await service.listTenants({ status: TenantStatus.ACTIVE });

      expect(mockQb.andWhere).toHaveBeenCalledWith('tenant.status = :status', { status: TenantStatus.ACTIVE });
    });

    it('should filter by subscription plan', async () => {
      const mockQb = createMockQueryBuilder();
      tenantRepository.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Tenant>);

      await service.listTenants({ plan: SubscriptionPlan.ENTERPRISE });

      expect(mockQb.andWhere).toHaveBeenCalledWith('tenant.subscriptionPlan = :plan', {
        plan: SubscriptionPlan.ENTERPRISE,
      });
    });

    it('should filter by minimum risk score', async () => {
      const mockQb = createMockQueryBuilder();
      tenantRepository.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Tenant>);

      await service.listTenants({ minRiskScore: 50 });

      expect(mockQb.andWhere).toHaveBeenCalledWith('tenant.riskScore >= :minRisk', { minRisk: 50 });
    });

    it('should filter by date range', async () => {
      const mockQb = createMockQueryBuilder();
      tenantRepository.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Tenant>);

      const after = '2025-01-01';
      const before = '2025-12-31';
      await service.listTenants({ createdAfter: after, createdBefore: before });

      expect(mockQb.andWhere).toHaveBeenCalledWith('tenant.createdAt >= :after', { after });
      expect(mockQb.andWhere).toHaveBeenCalledWith('tenant.createdAt <= :before', { before });
    });
  });

  describe('getTenant', () => {
    it('should return tenant by ID', async () => {
      tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

      const result = await service.getTenant('tenant-123');

      expect(result).toEqual(mockTenant);
      expect(tenantRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
    });

    it('should throw NotFoundException when tenant not found', async () => {
      tenantRepository.findOne.mockResolvedValue(null);

      await expect(service.getTenant('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTenant', () => {
    const createDto = {
      name: 'New Tenant',
      slug: 'new-tenant',
      subscriptionPlan: SubscriptionPlan.PRO,
      billingEmail: 'billing@new.com',
    };

    it('should create tenant successfully', async () => {
      tenantRepository.findOne.mockResolvedValue(null); // No existing slug
      tenantRepository.create.mockReturnValue(mockTenant as Tenant);
      tenantRepository.save.mockResolvedValue(mockTenant as Tenant);

      const result = await service.createTenant(createDto, platformUserId, ipAddress);

      expect(result).toBeDefined();
      expect(tenantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          slug: createDto.slug,
          status: TenantStatus.ACTIVE,
        }),
      );
    });

    it('should throw ConflictException if slug already exists', async () => {
      tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

      await expect(service.createTenant(createDto, platformUserId, ipAddress)).rejects.toThrow(ConflictException);
    });

    it('should log lifecycle event on creation', async () => {
      tenantRepository.findOne.mockResolvedValue(null);
      tenantRepository.create.mockReturnValue(mockTenant as Tenant);
      tenantRepository.save.mockResolvedValue(mockTenant as Tenant);

      await service.createTenant(createDto, platformUserId, ipAddress);

      expect(lifecycleEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CREATED',
          triggeredBy: platformUserId,
        }),
      );
    });

    it('should log to audit service', async () => {
      tenantRepository.findOne.mockResolvedValue(null);
      tenantRepository.create.mockReturnValue(mockTenant as Tenant);
      tenantRepository.save.mockResolvedValue(mockTenant as Tenant);

      await service.createTenant(createDto, platformUserId, ipAddress);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.TENANT_CREATED,
          platformUserId,
          ipAddress,
        }),
      );
    });
  });

  describe('updateTenant', () => {
    const updateDto = {
      name: 'Updated Tenant',
      billingEmail: 'new-billing@test.com',
    };

    it('should update tenant successfully', async () => {
      tenantRepository.findOne.mockResolvedValue({ ...mockTenant } as Tenant);
      tenantRepository.save.mockResolvedValue({
        ...mockTenant,
        ...updateDto,
      } as Tenant);

      const result = await service.updateTenant(
        'tenant-123',
        updateDto,
        platformUserId,
        ipAddress,
        'Update billing info',
      );

      expect(result.name).toBe(updateDto.name);
      expect(tenantRepository.save).toHaveBeenCalled();
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      tenantRepository.findOne.mockResolvedValue(null);

      await expect(service.updateTenant('nonexistent', updateDto, platformUserId, ipAddress, 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should log changes with before/after state', async () => {
      tenantRepository.findOne.mockResolvedValue({ ...mockTenant } as Tenant);
      tenantRepository.save.mockResolvedValue(mockTenant as Tenant);

      await service.updateTenant('tenant-123', updateDto, platformUserId, ipAddress, 'Update reason');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.TENANT_UPDATED,
          changesBefore: expect.any(Object),
          changesAfter: updateDto,
          reason: 'Update reason',
        }),
      );
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });
  });

  describe('suspendTenant', () => {
    const suspendDto = {
      reason: 'Payment failed',
      gracePeriodDays: 7,
    };

    it('should suspend tenant with grace period', async () => {
      tenantRepository.findOne.mockResolvedValue({ ...mockTenant } as Tenant);
      tenantRepository.save.mockImplementation((t) => Promise.resolve(t as Tenant));

      const result = await service.suspendTenant('tenant-123', suspendDto, platformUserId, ipAddress);

      expect(result.status).toBe(TenantStatus.GRACE_PERIOD);
      expect(result.suspendedBy).toBe(platformUserId);
      expect(result.suspensionReason).toBe(suspendDto.reason);
      expect(result.gracePeriodEndsAt).toBeDefined();
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });

    it('should suspend immediately without grace period', async () => {
      tenantRepository.findOne.mockResolvedValue({ ...mockTenant } as Tenant);
      tenantRepository.save.mockImplementation((t) => Promise.resolve(t as Tenant));

      const result = await service.suspendTenant(
        'tenant-123',
        { reason: 'Immediate suspension', gracePeriodDays: 0 },
        platformUserId,
        ipAddress,
      );

      expect(result.status).toBe(TenantStatus.SUSPENDED);
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });

    it('should throw ConflictException if already suspended', async () => {
      tenantRepository.findOne.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      } as Tenant);

      await expect(service.suspendTenant('tenant-123', suspendDto, platformUserId, ipAddress)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should log suspension to audit', async () => {
      tenantRepository.findOne.mockResolvedValue({ ...mockTenant } as Tenant);
      tenantRepository.save.mockImplementation((t) => Promise.resolve(t as Tenant));

      await service.suspendTenant('tenant-123', suspendDto, platformUserId, ipAddress);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.TENANT_SUSPENDED,
          reason: suspendDto.reason,
        }),
      );
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });
  });

  describe('reactivateTenant', () => {
    const reactivateDto = {
      reason: 'Payment received',
    };

    it('should reactivate suspended tenant', async () => {
      const suspendedTenant = {
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedBy: 'someone',
        suspensionReason: 'test',
      };
      tenantRepository.findOne.mockResolvedValue(suspendedTenant as Tenant);
      tenantRepository.save.mockImplementation((t) => Promise.resolve(t as Tenant));

      const result = await service.reactivateTenant('tenant-123', reactivateDto, platformUserId, ipAddress);

      expect(result.status).toBe(TenantStatus.ACTIVE);
      expect(result.suspendedAt).toBeNull();
      expect(result.suspendedBy).toBeNull();
      expect(result.suspensionReason).toBeNull();
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });

    it('should throw ConflictException if already active', async () => {
      tenantRepository.findOne.mockResolvedValue(mockTenant as Tenant);

      await expect(service.reactivateTenant('tenant-123', reactivateDto, platformUserId, ipAddress)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should log reactivation lifecycle event', async () => {
      tenantRepository.findOne.mockResolvedValue({
        ...mockTenant,
        status: TenantStatus.SUSPENDED,
      } as Tenant);
      tenantRepository.save.mockImplementation((t) => Promise.resolve(t as Tenant));

      await service.reactivateTenant('tenant-123', reactivateDto, platformUserId, ipAddress);

      expect(lifecycleEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'REACTIVATED',
          reason: reactivateDto.reason,
        }),
      );
      expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-123');
    });
  });
});
