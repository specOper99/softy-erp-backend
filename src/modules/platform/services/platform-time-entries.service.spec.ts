import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { createMockRepository } from '../../../../test/helpers/mock-factories';
import { Task } from '../../tasks/entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../../tasks/entities/time-entry.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTimeEntriesService } from './platform-time-entries.service';

describe('PlatformTimeEntriesService', () => {
  let service: PlatformTimeEntriesService;
  let repo: jest.Mocked<Repository<TimeEntry>>;
  let taskRepo: jest.Mocked<Repository<Task>>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    auditService = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformTimeEntriesService,
        {
          provide: getRepositoryToken(TimeEntry),
          useValue: createMockRepository<TimeEntry>(),
        },
        {
          provide: getRepositoryToken(Task),
          useValue: createMockRepository<Task>(),
        },
        {
          provide: PlatformAuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get(PlatformTimeEntriesService);
    repo = module.get(getRepositoryToken(TimeEntry));
    taskRepo = module.get(getRepositoryToken(Task));
  });

  it('returns time entries for the tenant', async () => {
    const entry = { id: 'entry-1', tenantId: 'tenant-1' } as TimeEntry;
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([entry]),
    };

    repo.createQueryBuilder.mockReturnValue(queryBuilder as unknown as SelectQueryBuilder<TimeEntry>);

    const result = await service.list('tenant-1', {});

    expect(result).toHaveLength(1);
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('entry');
    expect(queryBuilder.where).toHaveBeenCalledWith('entry.tenantId = :tenantId', { tenantId: 'tenant-1' });
  });

  it('throws when task filter is missing for tenant', async () => {
    taskRepo.findOne.mockResolvedValue(null);

    await expect(service.list('tenant-1', { taskId: 'task-1' })).rejects.toThrow(NotFoundException);
  });

  it('throws when time entry is missing for tenant', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('tenant-1', 'entry-1')).rejects.toThrow(NotFoundException);
  });

  it('updates time entry and recomputes duration for STOPPED entries', async () => {
    const entry = {
      id: 'entry-1',
      tenantId: 'tenant-1',
      status: TimeEntryStatus.STOPPED,
      startTime: new Date('2026-01-01T10:00:00Z'),
      endTime: new Date('2026-01-01T11:00:00Z'),
      durationMinutes: 60,
    } as TimeEntry;

    repo.findOne.mockResolvedValue(entry);
    repo.save.mockImplementation((entity) => Promise.resolve(entity as TimeEntry));

    const result = await service.update(
      'tenant-1',
      'entry-1',
      {
        endTime: '2026-01-01T12:00:00Z',
      },
      'platform-user-1',
      '127.0.0.1',
      'test-agent',
    );

    expect(result.durationMinutes).toBe(120);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        platformUserId: 'platform-user-1',
        action: PlatformAction.TIME_ENTRY_UPDATED,
        targetTenantId: 'tenant-1',
        targetEntityType: 'time_entry',
        targetEntityId: 'entry-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        changesBefore: expect.objectContaining({
          durationMinutes: 60,
        }),
        changesAfter: expect.objectContaining({
          durationMinutes: 120,
        }),
      }),
    );
  });
});
