import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createMockRepository } from '../../../../test/helpers/mock-factories';
import { Task } from '../../tasks/entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../../tasks/entities/time-entry.entity';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTimeEntriesService } from './platform-time-entries.service';

describe('PlatformTimeEntriesService', () => {
  let service: PlatformTimeEntriesService;
  let repo: jest.Mocked<Repository<TimeEntry>>;
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
  });
});
