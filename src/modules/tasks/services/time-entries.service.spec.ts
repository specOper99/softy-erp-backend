import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TimeEntry, TimeEntryStatus } from '../entities/time-entry.entity';
import { TimeEntriesService } from './time-entries.service';

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;
  let timeEntryRepo: jest.Mocked<Repository<TimeEntry>>;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockTimeEntry = {
    id: 'entry-123',
    tenantId: mockTenantId,
    userId: mockUserId,
    taskId: 'task-123',
    startTime: new Date(),
    endTime: null,
    status: TimeEntryStatus.RUNNING,
    durationMinutes: 0,
    billable: true,
    notes: 'Working on feature',
    stop: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeEntriesService,
        {
          provide: getRepositoryToken(TimeEntry),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TimeEntriesService>(TimeEntriesService);
    timeEntryRepo = module.get(getRepositoryToken(TimeEntry));

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startTimer', () => {
    it('should start a new timer', async () => {
      const dto = { taskId: 'task-123', billable: true };
      timeEntryRepo.findOne.mockResolvedValue(null); // No active timer
      timeEntryRepo.create.mockReturnValue(mockTimeEntry as any);
      timeEntryRepo.save.mockResolvedValue(mockTimeEntry as any);

      const result = await service.startTimer(mockUserId, dto as any);

      expect(timeEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          userId: mockUserId,
          taskId: dto.taskId,
          status: TimeEntryStatus.RUNNING,
          billable: true,
        }),
      );
      expect(result).toEqual(mockTimeEntry);
    });

    it('should throw if user has active timer', async () => {
      timeEntryRepo.findOne.mockResolvedValue(mockTimeEntry as any);

      await expect(service.startTimer(mockUserId, { taskId: 'task-123' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('stopTimer', () => {
    it('should stop running timer', async () => {
      const runningEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.RUNNING,
      };
      timeEntryRepo.findOne.mockResolvedValue(runningEntry as any);
      timeEntryRepo.save.mockResolvedValue({
        ...runningEntry,
        status: TimeEntryStatus.STOPPED,
      } as any);

      const result = await service.stopTimer(mockUserId, 'entry-123');

      expect(runningEntry.stop).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if not found', async () => {
      timeEntryRepo.findOne.mockResolvedValue(null);

      await expect(service.stopTimer(mockUserId, 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if not running', async () => {
      const stoppedEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.STOPPED,
      };
      timeEntryRepo.findOne.mockResolvedValue(stoppedEntry as any);

      await expect(service.stopTimer(mockUserId, 'entry-123')).rejects.toThrow(BadRequestException);
    });

    it('should use provided end time', async () => {
      const runningEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.RUNNING,
      };
      timeEntryRepo.findOne.mockResolvedValue(runningEntry as any);
      timeEntryRepo.save.mockResolvedValue(runningEntry as any);

      await service.stopTimer(mockUserId, 'entry-123', {
        endTime: '2024-01-15T18:00:00Z',
      });

      expect(runningEntry.stop).toHaveBeenCalledWith(new Date('2024-01-15T18:00:00Z'));
    });
  });

  describe('getActiveTimer', () => {
    it('should return active timer', async () => {
      timeEntryRepo.findOne.mockResolvedValue(mockTimeEntry as any);

      const result = await service.getActiveTimer(mockUserId);

      expect(timeEntryRepo.findOne).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          tenantId: mockTenantId,
          status: TimeEntryStatus.RUNNING,
        },
        relations: ['task'],
      });
      expect(result).toEqual(mockTimeEntry);
    });

    it('should return null when no active timer', async () => {
      timeEntryRepo.findOne.mockResolvedValue(null);

      const result = await service.getActiveTimer(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('getTaskTimeEntries', () => {
    it('should return time entries for task', async () => {
      timeEntryRepo.find.mockResolvedValue([mockTimeEntry] as any);

      const result = await service.getTaskTimeEntries('task-123');

      expect(timeEntryRepo.find).toHaveBeenCalledWith({
        where: { taskId: 'task-123', tenantId: mockTenantId },
        order: { startTime: 'DESC' },
        relations: ['user'],
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update time entry', async () => {
      timeEntryRepo.findOne.mockResolvedValue({ ...mockTimeEntry } as any);
      timeEntryRepo.save.mockResolvedValue({
        ...mockTimeEntry,
        notes: 'Updated notes',
      } as any);

      const result = await service.update(mockUserId, 'entry-123', {
        notes: 'Updated notes',
      } as any);

      expect(result.notes).toBe('Updated notes');
    });

    it('should throw NotFoundException if not found', async () => {
      timeEntryRepo.findOne.mockResolvedValue(null);

      await expect(service.update(mockUserId, 'non-existent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete time entry', async () => {
      timeEntryRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await service.delete('entry-123');

      expect(timeEntryRepo.delete).toHaveBeenCalledWith({
        id: 'entry-123',
        tenantId: mockTenantId,
      });
    });

    it('should throw NotFoundException if not found', async () => {
      timeEntryRepo.delete.mockResolvedValue({ affected: 0 } as any);

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
