import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createMockRepository } from '../../../../test/helpers/mock-factories';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantDeletionExecutorService } from '../services/tenant-deletion-executor.service';
import { TenantDeletionCron } from './tenant-deletion.cron';

describe('TenantDeletionCron', () => {
  let cron: TenantDeletionCron;
  let tenantRepo: ReturnType<typeof createMockRepository>;
  let executor: { executeScheduledDeletion: jest.Mock };
  let lockService: { withLock: jest.Mock };

  beforeEach(async () => {
    tenantRepo = createMockRepository();
    executor = { executeScheduledDeletion: jest.fn().mockResolvedValue(true) };
    lockService = {
      withLock: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantDeletionCron,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: TenantDeletionExecutorService, useValue: executor },
        { provide: DistributedLockService, useValue: lockService },
      ],
    }).compile();

    cron = module.get(TenantDeletionCron);
  });

  it('processes due tenants', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'tenant-1', status: TenantStatus.PENDING_DELETION },
        { id: 'tenant-2', status: TenantStatus.PENDING_DELETION },
      ]),
    };
    tenantRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await cron.processBatch();

    expect(result.processed).toBe(2);
    expect(executor.executeScheduledDeletion).toHaveBeenCalledTimes(2);
  });
});
