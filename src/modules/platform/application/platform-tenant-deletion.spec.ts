import { BadRequestException, ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createMockRepository } from '../../../../test/helpers/mock-factories';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantsService } from '../../tenants/application/tenants.service';
import { Tenant } from '../../tenants/domain/entities/tenant.entity';
import { TenantStatus } from '../../tenants/domain/enums/tenant-status.enum';
import { UsersService } from '../../users/application/users.service';
import { TenantLifecycleEvent } from '../domain/entities/tenant-lifecycle-event.entity';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTenantService } from './platform-tenant.service';
import { TenantDeletionExecutorService } from './tenant-deletion-executor.service';

describe('PlatformTenantService deletion lifecycle', () => {
  let service: PlatformTenantService;
  let tenantRepo: ReturnType<typeof createMockRepository>;
  let lifecycleRepo: ReturnType<typeof createMockRepository>;
  let deletionExecutor: { executeScheduledDeletion: jest.Mock };
  let auditService: { log: jest.Mock };

  const baseTenant: Partial<Tenant> = {
    id: 'tenant-1',
    name: 'Acme',
    slug: 'acme',
    status: TenantStatus.ACTIVE,
    deletionScheduledAt: null,
  };

  beforeEach(async () => {
    tenantRepo = createMockRepository();
    lifecycleRepo = createMockRepository();
    deletionExecutor = { executeScheduledDeletion: jest.fn().mockResolvedValue(true) };
    auditService = { log: jest.fn().mockResolvedValue(null) };

    lifecycleRepo.create.mockImplementation((entity) => entity);
    lifecycleRepo.save.mockImplementation((entity) => Promise.resolve({ id: 'event-1', ...entity }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformTenantService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: getRepositoryToken(TenantLifecycleEvent), useValue: lifecycleRepo },
        { provide: CacheUtilsService, useValue: { del: jest.fn() } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: UsersService, useValue: {} },
        { provide: TenantsService, useValue: {} },
        { provide: TenantDeletionExecutorService, useValue: deletionExecutor },
        { provide: PlatformAuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(PlatformTenantService);
  });

  it('scheduleTenantDeletion sets PENDING_DELETION and scheduled date', async () => {
    const scheduleDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    tenantRepo.findOne.mockResolvedValue({ ...baseTenant });
    tenantRepo.save.mockImplementation((tenant) => Promise.resolve(tenant));

    const result = await service.scheduleTenantDeletion('tenant-1', scheduleDate, 'op-1', 'reason long enough');

    expect(result.status).toBe(TenantStatus.PENDING_DELETION);
    expect(result.deletionScheduledAt).toEqual(scheduleDate);
    expect(deletionExecutor.executeScheduledDeletion).not.toHaveBeenCalled();
  });

  it('scheduleTenantDeletion returns null when immediate purge succeeds', async () => {
    const scheduleDate = new Date(Date.now() - 60_000);
    tenantRepo.findOne.mockResolvedValue({ ...baseTenant });
    tenantRepo.save.mockImplementation((tenant) => Promise.resolve(tenant));

    const result = await service.scheduleTenantDeletion(
      'tenant-1',
      scheduleDate,
      'op-1',
      'reason long enough',
      '127.0.0.1',
    );

    expect(result).toBeNull();
    expect(deletionExecutor.executeScheduledDeletion).toHaveBeenCalledWith('tenant-1', 'op-1', '127.0.0.1');
  });

  it('reactivateTenant clears deletionScheduledAt', async () => {
    tenantRepo.findOne.mockResolvedValue({
      ...baseTenant,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: new Date(Date.now() + 86_400_000),
    });
    tenantRepo.save.mockImplementation((tenant) => Promise.resolve(tenant));

    const result = await service.reactivateTenant('tenant-1', { reason: 'restore tenant access' }, 'op-1', '127.0.0.1');

    expect(result.status).toBe(TenantStatus.ACTIVE);
    expect(result.deletionScheduledAt).toBeNull();
  });

  it('cancelScheduledDeletion restores ACTIVE when still in grace window', async () => {
    tenantRepo.findOne.mockResolvedValue({
      ...baseTenant,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: new Date(Date.now() + 86_400_000),
    });
    tenantRepo.save.mockImplementation((tenant) => Promise.resolve(tenant));

    const result = await service.cancelScheduledDeletion('tenant-1', {}, 'op-1', '127.0.0.1', 'customer changed mind');

    expect(result.status).toBe(TenantStatus.ACTIVE);
    expect(result.deletionScheduledAt).toBeNull();
  });

  it('cancelScheduledDeletion rejects when grace window closed', async () => {
    tenantRepo.findOne.mockResolvedValue({
      ...baseTenant,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: new Date(Date.now() - 60_000),
    });

    await expect(
      service.cancelScheduledDeletion('tenant-1', {}, 'op-1', '127.0.0.1', 'too late now'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reactivateTenant rejects when deletion grace window closed', async () => {
    tenantRepo.findOne.mockResolvedValue({
      ...baseTenant,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: new Date(Date.now() - 60_000),
    });

    await expect(
      service.reactivateTenant('tenant-1', { reason: 'restore tenant access' }, 'op-1', '127.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scheduleTenantDeletion rejects when already pending', async () => {
    tenantRepo.findOne.mockResolvedValue({
      ...baseTenant,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: new Date(Date.now() + 86_400_000),
    });

    await expect(
      service.scheduleTenantDeletion('tenant-1', new Date(Date.now() + 86_400_000), 'op-1', 'reason'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
