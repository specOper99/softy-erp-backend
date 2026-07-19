import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { RefreshToken } from '../../auth/domain/entities/refresh-token.entity';
import { Tenant } from '../../tenants/domain/entities/tenant.entity';
import { TenantStatus } from '../../tenants/domain/enums/tenant-status.enum';
import { User } from '../../users/domain/entities/user.entity';
import { PlatformAction } from '../domain/enums/platform-action.enum';
import { TenantLifecycleEvent } from '../domain/entities/tenant-lifecycle-event.entity';
import { PlatformAuditService } from './platform-audit.service';
import { TenantDeletionExecutorService } from './tenant-deletion-executor.service';
import { TenantPurgeService } from './tenant-purge.service';

describe('TenantDeletionExecutorService', () => {
  let service: TenantDeletionExecutorService;
  let tenantRepository: { findOne: jest.Mock };
  let lifecycleEventRepository: { create: jest.Mock; save: jest.Mock };
  let userRepository: { createQueryBuilder: jest.Mock };
  let refreshTokenRepository: { createQueryBuilder: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let purgeService: { purgeTenantData: jest.Mock };
  let auditService: { log: jest.Mock };
  let cacheUtils: { del: jest.Mock };
  let distributedLockService: { withLock: jest.Mock };

  const tenantId = 'tenant-del-1';
  const past = new Date(Date.now() - 60_000);

  beforeEach(async () => {
    tenantRepository = { findOne: jest.fn() };
    lifecycleEventRepository = {
      create: jest.fn().mockImplementation((row) => row),
      save: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { createQueryBuilder: jest.fn() };
    refreshTokenRepository = { createQueryBuilder: jest.fn() };
    dataSource = { transaction: jest.fn() };
    purgeService = { purgeTenantData: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    cacheUtils = { del: jest.fn().mockResolvedValue(undefined) };
    distributedLockService = {
      withLock: jest.fn().mockImplementation(async (_key, fn) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantDeletionExecutorService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepository },
        { provide: getRepositoryToken(TenantLifecycleEvent), useValue: lifecycleEventRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: TenantPurgeService, useValue: purgeService },
        { provide: PlatformAuditService, useValue: auditService },
        { provide: CacheUtilsService, useValue: cacheUtils },
        { provide: DistributedLockService, useValue: distributedLockService },
      ],
    }).compile();

    service = module.get(TenantDeletionExecutorService);
  });

  function mockSessionRevoke(userIds: string[] = ['user-1']) {
    userRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(userIds.map((id) => ({ id }))),
    });
    refreshTokenRepository.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: userIds.length }),
    });
  }

  it('returns false when lock is not acquired', async () => {
    distributedLockService.withLock.mockResolvedValue(undefined);

    await expect(service.executeScheduledDeletion(tenantId, 'system')).resolves.toBe(false);
    expect(tenantRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns false when tenant is not PENDING_DELETION', async () => {
    tenantRepository.findOne.mockResolvedValue({
      id: tenantId,
      status: TenantStatus.ACTIVE,
      deletionScheduledAt: past,
    } as Tenant);

    await expect(service.executeScheduledDeletion(tenantId, 'system')).resolves.toBe(false);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('returns false when deletionScheduledAt is still in the future', async () => {
    tenantRepository.findOne.mockResolvedValue({
      id: tenantId,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: new Date(Date.now() + 3_600_000),
      name: 'Studio',
      slug: 'studio',
    } as Tenant);

    await expect(service.executeScheduledDeletion(tenantId, 'system')).resolves.toBe(false);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('revokes sessions, purges under lock, records lifecycle + audit on success', async () => {
    const tenant = {
      id: tenantId,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: past,
      name: 'Studio',
      slug: 'studio',
    } as Tenant;
    tenantRepository.findOne.mockResolvedValue(tenant);
    mockSessionRevoke(['user-1']);

    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(tenant),
      };
      await cb(manager);
    });

    await expect(service.executeScheduledDeletion(tenantId, 'platform-admin-1', '127.0.0.1')).resolves.toBe(true);

    expect(distributedLockService.withLock).toHaveBeenCalledWith(`tenant-deletion:${tenantId}`, expect.any(Function), {
      ttl: 300_000,
      maxRetries: 0,
    });
    expect(purgeService.purgeTenantData).toHaveBeenCalledWith(tenantId, expect.anything());
    expect(lifecycleEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventType: 'tenant.deleted',
        triggeredByType: 'platform_user',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PlatformAction.TENANT_DELETED,
        platformUserId: 'platform-admin-1',
        additionalContext: expect.objectContaining({ operation: 'execute_scheduled_deletion' }),
      }),
    );
    expect(cacheUtils.del).toHaveBeenCalledWith(`tenant:state:${tenantId}`);
  });

  it('returns false when inner transaction status gate fails (no purge)', async () => {
    const tenant = {
      id: tenantId,
      status: TenantStatus.PENDING_DELETION,
      deletionScheduledAt: past,
      name: 'Studio',
      slug: 'studio',
    } as Tenant;
    tenantRepository.findOne.mockResolvedValue(tenant);
    mockSessionRevoke([]);

    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<void>) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          ...tenant,
          status: TenantStatus.ACTIVE,
        }),
      };
      await cb(manager);
    });

    await expect(service.executeScheduledDeletion(tenantId, 'system')).resolves.toBe(false);
    expect(purgeService.purgeTenantData).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
