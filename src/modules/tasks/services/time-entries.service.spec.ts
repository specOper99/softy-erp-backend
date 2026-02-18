import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  createMockDataSource,
  createMockRepository,
  createMockTask,
  createMockTimeEntry,
  createMockUser,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { StartTimeEntryDto, StopTimeEntryDto, UpdateTimeEntryDto } from '../dto/time-entry.dto';
import { TimeEntry, TimeEntryStatus } from '../entities/time-entry.entity';
import { TimeEntriesService } from './time-entries.service';
import { User } from '../../users/entities/user.entity';

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;
  let timeEntryRepo: jest.Mocked<Repository<TimeEntry>>;
  let mockDataSource: ReturnType<typeof createMockDataSource>;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUser = createMockUser({ id: mockUserId, tenantId: mockTenantId }) as unknown as User;
  const mockTask = createMockTask({ id: 'task-123' });
  const mockTimeEntry = createMockTimeEntry({
    id: 'entry-123',
    tenantId: mockTenantId,
    userId: mockUserId,
    taskId: 'task-123',
    status: TimeEntryStatus.RUNNING,
  }) as unknown as TimeEntry;

  beforeEach(async () => {
    mockDataSource = createMockDataSource();

    // Configure the mock manager's query builder for pessimistic locking tests
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    mockDataSource.transaction = jest.fn().mockImplementation((cb) => {
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
        findOne: jest.fn().mockResolvedValue(mockTask),
        create: jest.fn().mockImplementation((_Entity, dto) => ({ ...mockTimeEntry, ...dto })),
        save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      };
      return cb(mockManager);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeEntriesService,
        {
          provide: getRepositoryToken(TimeEntry),
          useValue: createMockRepository<TimeEntry>(),
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TimeEntriesService>(TimeEntriesService);
    timeEntryRepo = module.get(getRepositoryToken(TimeEntry));

    mockTenantContext(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startTimer', () => {
    it('should start a new timer using pessimistic locking', async () => {
      const dto = { taskId: 'task-123', billable: true, latitude: 33.3152, longitude: 44.3661 } as StartTimeEntryDto;

      const result = await service.startTimer(mockUserId, dto);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(result).toMatchObject({
        tenantId: mockTenantId,
        userId: mockUserId,
        taskId: dto.taskId,
        status: TimeEntryStatus.RUNNING,
        billable: true,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
    });

    it('should throw if user has active timer', async () => {
      // Reconfigure transaction to return an active timer
      mockDataSource.transaction = jest.fn().mockImplementation((cb) => {
        const mockManager = {
          createQueryBuilder: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(mockTimeEntry), // Active timer exists
          }),
          create: jest.fn(),
          save: jest.fn(),
        };
        return cb(mockManager);
      });

      await expect(service.startTimer(mockUserId, { taskId: 'task-123' } as StartTimeEntryDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('stopTimer', () => {
    it('should stop running timer', async () => {
      const runningEntry = createMockTimeEntry({
        ...mockTimeEntry,
        status: TimeEntryStatus.RUNNING,
      }) as unknown as TimeEntry;
      timeEntryRepo.findOne.mockResolvedValue(runningEntry);
      timeEntryRepo.save.mockResolvedValue(
        createMockTimeEntry({
          ...runningEntry,
          status: TimeEntryStatus.STOPPED,
        }) as unknown as TimeEntry,
      );

      const result = await service.stopTimer(mockUserId, 'entry-123');

      expect(runningEntry.stop).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if not found', async () => {
      timeEntryRepo.findOne.mockResolvedValue(null);

      await expect(service.stopTimer(mockUserId, 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if not running', async () => {
      const stoppedEntry = createMockTimeEntry({
        ...mockTimeEntry,
        status: TimeEntryStatus.STOPPED,
      }) as unknown as TimeEntry;
      timeEntryRepo.findOne.mockResolvedValue(stoppedEntry);

      await expect(service.stopTimer(mockUserId, 'entry-123')).rejects.toThrow(BadRequestException);
    });

    it('should use provided end time', async () => {
      const runningEntry = createMockTimeEntry({
        ...mockTimeEntry,
        status: TimeEntryStatus.RUNNING,
      }) as unknown as TimeEntry;
      timeEntryRepo.findOne.mockResolvedValue(runningEntry);
      timeEntryRepo.save.mockResolvedValue(runningEntry);

      await service.stopTimer(mockUserId, 'entry-123', {
        endTime: '2024-01-15T18:00:00Z',
      } as StopTimeEntryDto);

      expect(runningEntry.stop).toHaveBeenCalledWith(new Date('2024-01-15T18:00:00Z'));
    });

    it('should update coordinates when provided on stop', async () => {
      const runningEntry = createMockTimeEntry({
        ...mockTimeEntry,
        status: TimeEntryStatus.RUNNING,
        latitude: null,
        longitude: null,
      }) as unknown as TimeEntry;
      timeEntryRepo.findOne.mockResolvedValue(runningEntry);
      timeEntryRepo.save.mockResolvedValue(runningEntry);

      await service.stopTimer(mockUserId, 'entry-123', {
        latitude: 33.3152,
        longitude: 44.3661,
      } as StopTimeEntryDto);

      expect(runningEntry.latitude).toBe(33.3152);
      expect(runningEntry.longitude).toBe(44.3661);
      expect(timeEntryRepo.save).toHaveBeenCalledWith(runningEntry);
    });
  });

  describe('getActiveTimer', () => {
    it('should return active timer', async () => {
      timeEntryRepo.findOne.mockResolvedValue(mockTimeEntry);

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
      timeEntryRepo.find.mockResolvedValue([mockTimeEntry]);

      const result = await service.getTaskTimeEntries('task-123');

      expect(timeEntryRepo.find).toHaveBeenCalledWith({
        where: { taskId: 'task-123', tenantId: mockTenantId },
        order: { startTime: 'DESC' },
        relations: ['user'],
        take: 1000,
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update time entry', async () => {
      timeEntryRepo.findOne.mockResolvedValue(mockTimeEntry);
      timeEntryRepo.save.mockResolvedValue(
        createMockTimeEntry({
          ...mockTimeEntry,
          notes: 'Updated notes',
        }) as unknown as TimeEntry,
      );

      const result = await service.update(mockUser, 'entry-123', {
        notes: 'Updated notes',
      } as UpdateTimeEntryDto);

      expect(result.notes).toBe('Updated notes');
    });

    it('should throw NotFoundException if not found', async () => {
      timeEntryRepo.findOne.mockResolvedValue(null);

      await expect(service.update(mockUser, 'non-existent', {} as UpdateTimeEntryDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete time entry', async () => {
      timeEntryRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.delete('entry-123');

      expect(timeEntryRepo.delete).toHaveBeenCalledWith({
        id: 'entry-123',
        tenantId: mockTenantId,
      });
    });

    it('should throw NotFoundException if not found', async () => {
      timeEntryRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
