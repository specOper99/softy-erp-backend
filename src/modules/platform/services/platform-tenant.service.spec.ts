import { BadRequestException, ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createMockRepository } from '../../../../test/helpers/mock-factories';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantsService } from '../../tenants/tenants.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import { Role } from '../../users/enums/role.enum';
import { UsersService } from '../../users/services/users.service';
import type { CreateTenantDto, UpdateTenantDto } from '../dto/tenant-management.dto';
import { TenantLifecycleEvent } from '../entities/tenant-lifecycle-event.entity';
import { PlatformTenantService } from './platform-tenant.service';
import { TenantDeletionExecutorService } from './tenant-deletion-executor.service';

const TEST_PASSWORD = 'KeepTesting123!';

describe('PlatformTenantService.createTenant', () => {
  let service: PlatformTenantService;
  let tenantRepo: ReturnType<typeof createMockRepository>;
  let lifecycleRepo: ReturnType<typeof createMockRepository>;
  let cacheUtils: { del: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let usersService: { findByEmailGlobal: jest.Mock; createWithManager: jest.Mock };
  let tenantsService: { createWithManager: jest.Mock };

  const mockManager = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const buildDto = (overrides: Partial<CreateTenantDto> = {}): CreateTenantDto => ({
    name: 'Acme Studio',
    slug: 'acme-studio',
    subscriptionPlan: 'FREE' as never,
    billingEmail: 'billing@acme.example',
    initialAdmin: { email: 'owner@acme.example', password: TEST_PASSWORD },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    tenantRepo = createMockRepository();
    lifecycleRepo = createMockRepository();
    cacheUtils = { del: jest.fn().mockResolvedValue(undefined) };
    usersService = {
      findByEmailGlobal: jest.fn().mockResolvedValue(null),
      createWithManager: jest.fn().mockImplementation((_m, dto) => Promise.resolve({ id: 'user-uuid', ...dto })),
    };
    tenantsService = {
      createWithManager: jest.fn().mockImplementation((_m, dto) =>
        Promise.resolve({
          id: 'tenant-uuid',
          ...dto,
          status: TenantStatus.INACTIVE,
          lastActivityAt: null,
        }),
      ),
    };

    mockManager.save.mockImplementation((entity) => Promise.resolve(entity));

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
    };

    lifecycleRepo.create.mockImplementation((entity) => entity);
    lifecycleRepo.save.mockImplementation((entity) => Promise.resolve({ id: 'event-uuid', ...entity }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformTenantService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: getRepositoryToken(TenantLifecycleEvent), useValue: lifecycleRepo },
        { provide: CacheUtilsService, useValue: cacheUtils },
        { provide: DataSource, useValue: dataSource },
        { provide: UsersService, useValue: usersService },
        { provide: TenantsService, useValue: tenantsService },
        { provide: TenantDeletionExecutorService, useValue: {} },
      ],
    }).compile();

    service = module.get(PlatformTenantService);
  });

  it('creates a tenant with required initial admin and records lifecycle event', async () => {
    tenantRepo.findOne.mockResolvedValue(null);

    const result = await service.createTenant(buildDto(), 'platform-op-1', '127.0.0.1');

    expect(result.id).toBe('tenant-uuid');
    expect(result.status).toBe(TenantStatus.ACTIVE);
    expect(usersService.createWithManager).toHaveBeenCalledWith(
      mockManager,
      expect.objectContaining({
        email: 'owner@acme.example',
        role: Role.ADMIN,
        tenantId: 'tenant-uuid',
      }),
    );
    expect(lifecycleRepo.save).toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-uuid');
  });

  it('provisions an ADMIN user in the same transaction when initialAdmin is provided', async () => {
    tenantRepo.findOne.mockResolvedValue(null);
    usersService.findByEmailGlobal.mockResolvedValue(null);

    const dto = buildDto({
      initialAdmin: { email: 'owner@acme.example', password: TEST_PASSWORD },
    });

    const result = await service.createTenant(dto, 'platform-op-1', '127.0.0.1');

    expect(result.id).toBe('tenant-uuid');
    expect(usersService.findByEmailGlobal).toHaveBeenCalledWith('owner@acme.example');
    expect(usersService.createWithManager).toHaveBeenCalledWith(
      mockManager,
      expect.objectContaining({
        email: 'owner@acme.example',
        password: TEST_PASSWORD,
        role: Role.ADMIN,
        tenantId: 'tenant-uuid',
      }),
    );
    expect(tenantsService.createWithManager).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects with 409 when initialAdmin email already exists globally', async () => {
    tenantRepo.findOne.mockResolvedValue(null);
    usersService.findByEmailGlobal.mockResolvedValue({ id: 'existing-user' });

    const dto = buildDto({
      initialAdmin: { email: 'taken@example.com', password: TEST_PASSWORD },
    });

    await expect(service.createTenant(dto, 'op', 'ip')).rejects.toBeInstanceOf(ConflictException);
    expect(usersService.createWithManager).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects with 409 when slug is already taken', async () => {
    tenantRepo.findOne.mockResolvedValue({ id: 'existing-tenant', slug: 'acme-studio' });

    await expect(service.createTenant(buildDto(), 'op', 'ip')).rejects.toBeInstanceOf(ConflictException);
    expect(usersService.findByEmailGlobal).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not create the admin user when the tenant save fails inside the transaction', async () => {
    tenantRepo.findOne.mockResolvedValue(null);
    usersService.findByEmailGlobal.mockResolvedValue(null);

    mockManager.save.mockImplementationOnce(() => {
      throw new Error('boom: tenant save failed');
    });

    const dto = buildDto({
      initialAdmin: { email: 'owner@acme.example', password: TEST_PASSWORD },
    });

    await expect(service.createTenant(dto, 'op', 'ip')).rejects.toThrow('boom');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(usersService.createWithManager).not.toHaveBeenCalled();
    expect(cacheUtils.del).not.toHaveBeenCalled();
  });
});

describe('PlatformTenantService.updateTenant', () => {
  let service: PlatformTenantService;
  let tenantRepo: ReturnType<typeof createMockRepository>;
  let lifecycleRepo: ReturnType<typeof createMockRepository>;
  let cacheUtils: { del: jest.Mock };

  const existingTenant = {
    id: 'tenant-uuid',
    name: 'Acme Studio',
    slug: 'acme-studio',
    subscriptionPlan: 'FREE',
    billingEmail: 'billing@acme.example',
    subscriptionStartedAt: new Date('2026-01-01'),
    subscriptionEndsAt: new Date('2026-02-01'),
    trialEndsAt: null,
    status: TenantStatus.ACTIVE,
    deletionScheduledAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    tenantRepo = createMockRepository();
    lifecycleRepo = createMockRepository();
    cacheUtils = { del: jest.fn().mockResolvedValue(undefined) };

    tenantRepo.findOne.mockResolvedValue(existingTenant);
    tenantRepo.save.mockImplementation((entity) => Promise.resolve(entity));
    lifecycleRepo.create.mockImplementation((entity) => entity);
    lifecycleRepo.save.mockImplementation((entity) => Promise.resolve({ id: 'event-uuid', ...entity }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformTenantService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: getRepositoryToken(TenantLifecycleEvent), useValue: lifecycleRepo },
        { provide: CacheUtilsService, useValue: cacheUtils },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: UsersService, useValue: {} },
        { provide: TenantsService, useValue: {} },
        { provide: TenantDeletionExecutorService, useValue: {} },
      ],
    }).compile();

    service = module.get(PlatformTenantService);
  });

  it('updates subscription dates and trial end', async () => {
    const dto: UpdateTenantDto = {
      subscriptionStartedAt: '2026-03-01',
      subscriptionEndsAt: '2026-04-01',
      trialEndsAt: '2026-03-15',
    };

    const result = await service.updateTenant('tenant-uuid', dto, 'platform-op-1', '127.0.0.1', 'Plan change');

    expect(result.subscriptionStartedAt).toEqual(new Date('2026-03-01'));
    expect(result.subscriptionEndsAt).toEqual(new Date('2026-04-01'));
    expect(result.trialEndsAt).toEqual(new Date('2026-03-15'));
    expect(lifecycleRepo.save).toHaveBeenCalled();
    expect(cacheUtils.del).toHaveBeenCalledWith('tenant:state:tenant-uuid');
  });

  it('clears subscription dates when null is provided', async () => {
    const dto: UpdateTenantDto = {
      subscriptionStartedAt: null,
      subscriptionEndsAt: null,
      trialEndsAt: null,
    };

    const result = await service.updateTenant('tenant-uuid', dto, 'platform-op-1', '127.0.0.1', 'Clear dates');

    expect(result.subscriptionStartedAt).toBeNull();
    expect(result.subscriptionEndsAt).toBeNull();
    expect(result.trialEndsAt).toBeNull();
  });

  it('rejects when subscription end is before start', async () => {
    const dto: UpdateTenantDto = {
      subscriptionStartedAt: '2026-05-01',
      subscriptionEndsAt: '2026-04-01',
    };

    await expect(
      service.updateTenant('tenant-uuid', dto, 'platform-op-1', '127.0.0.1', 'Invalid dates'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantRepo.save).not.toHaveBeenCalled();
  });
});
