import { ConflictException } from '@nestjs/common';
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
import type { CreateTenantDto } from '../dto/tenant-management.dto';
import { TenantLifecycleEvent } from '../entities/tenant-lifecycle-event.entity';
import { PlatformTenantService } from './platform-tenant.service';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformTenantService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: getRepositoryToken(TenantLifecycleEvent), useValue: lifecycleRepo },
        { provide: CacheUtilsService, useValue: cacheUtils },
        { provide: DataSource, useValue: dataSource },
        { provide: UsersService, useValue: usersService },
        { provide: TenantsService, useValue: tenantsService },
      ],
    }).compile();

    service = module.get(PlatformTenantService);
  });

  it('creates a tenant without an initial admin', async () => {
    tenantRepo.findOne.mockResolvedValue(null);

    const result = await service.createTenant(buildDto(), 'platform-op-1', '127.0.0.1');

    expect(result.id).toBe('tenant-uuid');
    expect(result.status).toBe(TenantStatus.ACTIVE);
    expect(tenantsService.createWithManager).toHaveBeenCalledWith(
      mockManager,
      expect.objectContaining({ name: 'Acme Studio', slug: 'acme-studio' }),
    );
    expect(usersService.findByEmailGlobal).not.toHaveBeenCalled();
    expect(usersService.createWithManager).not.toHaveBeenCalled();
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
