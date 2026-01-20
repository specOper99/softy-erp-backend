import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Response } from 'express';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Task } from '../entities/task.entity';
import { TasksExportService } from './tasks-export.service';

describe('TasksExportService', () => {
  let service: TasksExportService;

  const mockQueryStream = {
    destroy: jest.fn(),
  };

  const mockTaskRepository = {
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      stream: jest.fn().mockResolvedValue(mockQueryStream),
    })),
  };

  const mockExportService = {
    streamFromStream: jest.fn(),
  };

  const mockResponse = {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksExportService,
        { provide: getRepositoryToken(Task), useValue: mockTaskRepository },
        { provide: ExportService, useValue: mockExportService },
      ],
    }).compile();

    service = module.get<TasksExportService>(TasksExportService);

    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('tenant-123');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportToCSV', () => {
    it('should stream export csv', async () => {
      await service.exportToCSV(mockResponse);

      expect(mockTaskRepository.createQueryBuilder).toHaveBeenCalledWith('task');
      expect(mockExportService.streamFromStream).toHaveBeenCalledWith(
        mockResponse,
        mockQueryStream,
        expect.stringContaining('tasks-export-'),
        expect.any(Array),
        expect.any(Function),
      );
    });

    it('should transform rows correctly', async () => {
      await service.exportToCSV(mockResponse);
      const transformFn = mockExportService.streamFromStream.mock.calls[0][4];

      const rawRow = {
        task_id: '1',
        task_status: 'PENDING',
        task_dueDate: '2025-01-01',
        task_bookingId: 'b1',
        client_name: 'Client',
        taskType_name: 'Type',
        assignedUser_email: 'user@example.com',
        task_commissionSnapshot: 100,
        task_notes: 'Notes',
        task_completedAt: null,
        task_createdAt: '2024-01-01',
      };

      const transformed = transformFn(rawRow);
      expect(transformed).toEqual({
        id: '1',
        status: 'PENDING',
        dueDate: expect.any(String),
        bookingId: 'b1',
        clientName: 'Client',
        taskType: 'Type',
        assignedUser: 'user@example.com',
        commissionSnapshot: 100,
        notes: 'Notes',
        completedAt: '',
        createdAt: expect.any(String),
      });
    });
  });
});
