import { Test, TestingModule } from '@nestjs/testing';
import {
  createMockDepartmentBudget,
  createMockRepository,
  MockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateBudgetDto } from '../dto/budget.dto';
import { DepartmentBudget } from '../entities/department-budget.entity';
import { Transaction } from '../entities/transaction.entity';
import { DepartmentBudgetRepository } from '../repositories/department-budget.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { FinancialReportService } from './financial-report.service';

describe('FinancialReportService', () => {
  let service: FinancialReportService;
  let transactionRepo: MockRepository<Transaction>;
  let budgetRepo: MockRepository<DepartmentBudget>;

  const mockTenantId = 'tenant-123';

  beforeEach(async () => {
    const mockTransactionRepo = createMockRepository();
    const mockBudgetRepo = createMockRepository();
    const mockCacheUtils = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialReportService,
        {
          provide: TransactionRepository,
          useValue: mockTransactionRepo,
        },
        {
          provide: DepartmentBudgetRepository,
          useValue: mockBudgetRepo,
        },
        {
          provide: CacheUtilsService,
          useValue: mockCacheUtils,
        },
      ],
    }).compile();

    service = module.get<FinancialReportService>(FinancialReportService);
    transactionRepo = module.get(TransactionRepository);
    budgetRepo = module.get(DepartmentBudgetRepository);

    mockTenantContext(mockTenantId);
    // Mock getTenantIdOrThrow specifically if needed, but mockTenantContext does it for getTenantId
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertBudget', () => {
    it('should create new budget if not exists', async () => {
      const dto = {
        department: 'Engineering',
        period: '2024-01',
        budgetAmount: 10000,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      budgetRepo.findOne.mockResolvedValue(null);
      budgetRepo.create.mockReturnValue(createMockDepartmentBudget(dto) as unknown as DepartmentBudget);
      budgetRepo.save.mockResolvedValue(
        createMockDepartmentBudget({ ...dto, id: 'budget-1' }) as unknown as DepartmentBudget,
      );

      await service.upsertBudget(dto as CreateBudgetDto);

      expect(budgetRepo.findOne).toHaveBeenCalledWith({
        where: { department: dto.department, period: dto.period },
      });
      // create should NOT be called with tenantId as it is injected by repository,
      // BUT current implementation of upsertBudget calls repo.create sans tenantId.
      // TenantAwareRepository doesn't inject it on CREATE call, but on SAVE call implicitly
      // if it's missing?
      // Actually `TenantAwareRepository` overrides `save` and `create`?
      // Wait, `TenantAwareRepository` definition:
      // it overrides `save`. It does NOT override `create`.
      // So `create` just creates object. `save` injects tenantId.
      // So expectation here is just what we passed to create.
      expect(budgetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          department: dto.department,
          budgetAmount: dto.budgetAmount,
        }),
      );
      expect(budgetRepo.save).toHaveBeenCalled();
    });

    it('should update existing budget', async () => {
      const dto = {
        department: 'Engineering',
        period: '2024-01',
        budgetAmount: 20000,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const existingBudget = createMockDepartmentBudget({
        id: 'budget-1',
        department: 'Engineering',
        period: '2024-01',
        budgetAmount: 10000,
      }) as unknown as DepartmentBudget;

      budgetRepo.findOne.mockResolvedValue(existingBudget);
      budgetRepo.save.mockResolvedValue(
        createMockDepartmentBudget({ ...existingBudget, ...dto }) as unknown as DepartmentBudget,
      );

      await service.upsertBudget(dto as CreateBudgetDto);

      expect(budgetRepo.findOne).toHaveBeenCalledWith({
        where: { department: dto.department, period: dto.period },
      });
      expect(budgetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetAmount: 20000,
        }),
      );
    });
  });

  describe('getBudgetReport', () => {
    it('should return budgets', async () => {
      budgetRepo.find.mockResolvedValue([
        createMockDepartmentBudget({
          id: 'b1',
          department: 'Eng',
          budgetAmount: 1000,
          period: '2024-01',
        }),
      ] as unknown as DepartmentBudget[]);

      // Mock query builder for date range
      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          minStart: new Date(),
          maxEnd: new Date(),
        }),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ department: 'Eng', total: '500' }]),
      };
      budgetRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      // Mock transaction query builder
      transactionRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      const result = await service.getBudgetReport('2024-01');

      expect(budgetRepo.find).toHaveBeenCalledWith({
        where: { period: '2024-01' },
        order: { department: 'ASC' },
        take: 500,
      });
      expect(result).toHaveLength(1);
      expect(result[0].actualSpent).toBe(500);
      expect(result[0].variance).toBe(500);
    });
  });
});
