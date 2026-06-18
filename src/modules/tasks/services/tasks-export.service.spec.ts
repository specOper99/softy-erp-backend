import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TENANT_REPO_TASK } from '../../../common/constants/tenant-repo.tokens';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TasksExportService } from './tasks-export.service';

describe('TasksExportService', () => {
  let service: TasksExportService;

  const mockQueryStream = {
    destroy: jest.fn(),
  };

  const mockTaskRepository = {
    createStreamQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksExportService,
        { provide: TENANT_REPO_TASK, useValue: mockTaskRepository },
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
    it('should stream export csv via tenant-aware query builder', async () => {
      await service.exportToCSV(mockResponse as never);

      expect(mockTaskRepository.createStreamQueryBuilder).toHaveBeenCalledWith('task');
      expect(mockExportService.streamFromStream).toHaveBeenCalledWith(
        mockResponse,
        mockQueryStream,
        expect.stringContaining('tasks-export-'),
        expect.any(Array),
        expect.any(Function),
      );
    });
  });
});
