import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TimeEntryStatus } from '../entities/time-entry.entity';
import { TimeEntriesService } from '../services/time-entries.service';
import { TimeEntriesController } from './time-entries.controller';

describe('TimeEntriesController', () => {
  let controller: TimeEntriesController;
  let service: jest.Mocked<TimeEntriesService>;

  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockTimeEntry = {
    id: 'entry-123',
    userId: 'user-123',
    taskId: 'task-123',
    status: TimeEntryStatus.RUNNING,
    startTime: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeEntriesController],
      providers: [
        {
          provide: TimeEntriesService,
          useValue: {
            startTimer: jest.fn(),
            stopTimer: jest.fn(),
            getActiveTimer: jest.fn(),
            getTaskTimeEntries: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<TimeEntriesController>(TimeEntriesController);
    service = module.get(TimeEntriesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startTimer', () => {
    it('should start timer for user', async () => {
      const dto = { taskId: 'task-123' };
      service.startTimer.mockResolvedValue(mockTimeEntry as any);

      const result = await controller.startTimer(mockUser as any, dto as any);

      expect(service.startTimer).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual(mockTimeEntry);
    });
  });

  describe('stopTimer', () => {
    it('should stop timer', async () => {
      const dto = { notes: 'completed' };
      const stoppedEntry = {
        ...mockTimeEntry,
        status: TimeEntryStatus.STOPPED,
      };
      service.stopTimer.mockResolvedValue(stoppedEntry as any);

      const result = await controller.stopTimer(
        mockUser as any,
        'entry-123',
        dto as any,
      );

      expect(service.stopTimer).toHaveBeenCalledWith(
        mockUser.id,
        'entry-123',
        dto,
      );
      expect(result.status).toBe(TimeEntryStatus.STOPPED);
    });
  });

  describe('getActiveTimer', () => {
    it('should return active timer', async () => {
      service.getActiveTimer.mockResolvedValue(mockTimeEntry as any);

      const result = await controller.getActiveTimer(mockUser as any);

      expect(service.getActiveTimer).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockTimeEntry);
    });

    it('should return null when no active timer', async () => {
      service.getActiveTimer.mockResolvedValue(null);

      const result = await controller.getActiveTimer(mockUser as any);

      expect(result).toBeNull();
    });
  });

  describe('getTaskTimeEntries', () => {
    it('should return time entries for task', async () => {
      service.getTaskTimeEntries.mockResolvedValue([mockTimeEntry] as any);

      const result = await controller.getTaskTimeEntries('task-123');

      expect(service.getTaskTimeEntries).toHaveBeenCalledWith('task-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update time entry', async () => {
      const dto = { notes: 'updated' };
      service.update.mockResolvedValue({
        ...mockTimeEntry,
        notes: 'updated',
      } as any);

      const result = await controller.update(
        mockUser as any,
        'entry-123',
        dto as any,
      );

      expect(service.update).toHaveBeenCalledWith(
        mockUser.id,
        'entry-123',
        dto,
      );
      expect(result.notes).toBe('updated');
    });
  });

  describe('delete', () => {
    it('should delete time entry', async () => {
      service.delete.mockResolvedValue(undefined);

      await controller.delete('entry-123');

      expect(service.delete).toHaveBeenCalledWith('entry-123');
    });
  });
});
