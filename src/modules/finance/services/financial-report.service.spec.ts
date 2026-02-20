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
import { PurchaseInvoice } from '../entities/purchase-invoice.entity';
import { Transaction } from '../entities/transaction.entity';
import { DepartmentBudgetRepository } from '../repositories/department-budget.repository';
import { PurchaseInvoiceRepository } from '../repositories/purchase-invoice.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { FinancialReportService } from './financial-report.service';

describe('FinancialReportService', () => {
  let service: FinancialReportService;
  let transactionRepo: MockRepository<Transaction>;
  let budgetRepo: MockRepository<DepartmentBudget>;
  let purchaseInvoiceRepo: MockRepository<PurchaseInvoice>;

  const mockTenantId = 'tenant-123';

  beforeEach(async () => {
    const mockTransactionRepo = createMockRepository();
    const mockBudgetRepo = createMockRepository();
    const mockPurchaseInvoiceRepo = createMockRepository();
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
        {
          provide: PurchaseInvoiceRepository,
          useValue: mockPurchaseInvoiceRepo,
        },
      ],
    }).compile();

    service = module.get<FinancialReportService>(FinancialReportService);
    transactionRepo = module.get(TransactionRepository);
    budgetRepo = module.get(DepartmentBudgetRepository);
    purchaseInvoiceRepo = module.get(PurchaseInvoiceRepository);

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
      const firstBudget = result[0];
      expect(firstBudget).toBeDefined();
      if (!firstBudget) {
        throw new Error('Expected first budget report row to exist');
      }
      expect(firstBudget.actualSpent).toBe(500);
      expect(firstBudget.variance).toBe(500);
    });
  });

  describe('statements', () => {
    const createStatementQbMock = (rows: unknown[]) => {
      return {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
    };

    it('should aggregate client statement lines and totals correctly', async () => {
      const qbMock = createStatementQbMock([
        {
          id: 'tx-income',
          type: 'INCOME',
          amount: '1000.00',
          category: 'Booking Payment',
          description: 'Collected amount',
          transactionDate: '2026-01-10T00:00:00.000Z',
          referenceId: 'booking-1',
          currency: 'USD',
        },
        {
          id: 'tx-refund',
          type: 'INCOME',
          amount: '-100.00',
          category: 'Refund',
          description: 'Partial refund',
          transactionDate: '2026-01-12T00:00:00.000Z',
          referenceId: 'booking-1',
          currency: 'USD',
        },
        {
          id: 'tx-expense',
          type: 'EXPENSE',
          amount: '200.00',
          category: 'Logistics',
          description: 'Transport',
          transactionDate: '2026-01-15T00:00:00.000Z',
          referenceId: 'booking-1',
          currency: 'USD',
        },
      ]);

      transactionRepo.createQueryBuilder.mockReturnValue(qbMock as never);

      const result = await service.getClientStatement({
        clientId: 'client-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(result.entityId).toBe('client-1');
      expect(result.lines).toHaveLength(3);
      expect(result.totals).toEqual({
        income: 900,
        expense: 200,
        payroll: 0,
        net: 700,
      });
      const secondLine = result.lines[1];
      expect(secondLine).toBeDefined();
      if (!secondLine) {
        throw new Error('Expected second client statement line to exist');
      }
      expect(secondLine.amount).toBe(-100);
    });

    it('should include vendor invoice transaction lines', async () => {
      const qbMock = createStatementQbMock([
        {
          id: 'tx-vendor-1',
          type: 'EXPENSE',
          amount: '350.00',
          category: 'Purchase Invoice',
          description: 'Purchase invoice PI-2026-001',
          transactionDate: '2026-02-01T00:00:00.000Z',
          referenceId: 'PI-2026-001',
          currency: 'USD',
        },
      ]);

      purchaseInvoiceRepo.createQueryBuilder.mockReturnValue(qbMock as never);

      const result = await service.getVendorStatement({
        vendorId: 'vendor-1',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      expect(purchaseInvoiceRepo.createQueryBuilder).toHaveBeenCalledWith('pi');
      expect(result.entityId).toBe('vendor-1');
      expect(result.lines).toHaveLength(1);
      const firstLine = result.lines[0];
      expect(firstLine).toBeDefined();
      if (!firstLine) {
        throw new Error('Expected vendor statement line to exist');
      }
      expect(firstLine.referenceId).toBe('PI-2026-001');
      expect(result.totals).toEqual({
        income: 0,
        expense: 350,
        payroll: 0,
        net: -350,
      });
    });

    it('should filter employee statement by payout metadata userId', async () => {
      const qbMock = createStatementQbMock([
        {
          id: 'tx-payroll-1',
          type: 'PAYROLL',
          amount: '800.00',
          category: 'Payroll',
          description: 'January payroll',
          transactionDate: '2026-01-31T00:00:00.000Z',
          referenceId: 'payout-1',
          currency: 'USD',
        },
      ]);

      transactionRepo.createQueryBuilder.mockReturnValue(qbMock as never);

      const result = await service.getEmployeeStatement({
        userId: 'user-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith("p.metadata->>'userId' = :userId", { userId: 'user-1' });
      expect(result.entityId).toBe('user-1');
      expect(result.totals).toEqual({
        income: 0,
        expense: 0,
        payroll: 800,
        net: -800,
      });
    });
  });

  describe('getPackageProfitability', () => {
    it('should return package profitability sorted by revenue desc with net profit', async () => {
      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            packageId: 'pkg-low',
            revenue: '900.00',
            commissions: '200.00',
            expenses: '100.00',
          },
          {
            packageId: 'pkg-high',
            revenue: '1200.00',
            commissions: '300.00',
            expenses: '100.00',
          },
          {
            packageId: 'pkg-refund',
            revenue: '-50.00',
            commissions: '0.00',
            expenses: '0.00',
          },
        ]),
      };

      transactionRepo.createQueryBuilder.mockReturnValue(qbMock as never);

      const result = await service.getPackageProfitability({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(transactionRepo.createQueryBuilder).toHaveBeenCalledWith('tq');
      expect(qbMock.where).toHaveBeenCalledWith('b.tenant_id = :tenantId', { tenantId: mockTenantId });
      expect(qbMock.andWhere).toHaveBeenCalledWith('b.event_date >= :startDate', { startDate: '2026-01-01' });
      expect(qbMock.andWhere).toHaveBeenCalledWith('b.event_date <= :endDate', { endDate: '2026-01-31' });

      expect(result).toEqual([
        {
          packageId: 'pkg-high',
          revenue: 1200,
          commissions: 300,
          expenses: 100,
          netProfit: 800,
        },
        {
          packageId: 'pkg-low',
          revenue: 900,
          commissions: 200,
          expenses: 100,
          netProfit: 600,
        },
        {
          packageId: 'pkg-refund',
          revenue: -50,
          commissions: 0,
          expenses: 0,
          netProfit: -50,
        },
      ]);
    });
  });
});
