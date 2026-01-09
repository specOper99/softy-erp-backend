import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../common/cache/cache-utils.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { DailyMetrics } from '../analytics/entities/daily-metrics.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { TransactionType } from '../finance/enums/transaction-type.enum';
import { Profile } from '../hr/entities/profile.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import { DashboardService } from './dashboard.service';
import { UserPreference } from './entities/user-preference.entity';

describe('DashboardService', () => {
  let service: DashboardService;
  let transactionRepo: Repository<Transaction>;
  let taskRepo: Repository<Task>;
  let bookingRepo: Repository<Booking>;
  let metricsRepo: Repository<DailyMetrics>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    count: jest.fn(),
  };

  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Task),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(UserPreference),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(DailyMetrics),
          useValue: mockRepository,
        },
        {
          provide: CacheUtilsService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    transactionRepo = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    taskRepo = module.get<Repository<Task>>(getRepositoryToken(Task));
    bookingRepo = module.get<Repository<Booking>>(getRepositoryToken(Booking));
    metricsRepo = module.get<Repository<DailyMetrics>>(
      getRepositoryToken(DailyMetrics),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getKpiSummary', () => {
    it('should return KPI summary from DailyMetrics', async () => {
      // Mock returns
      // metricsRepo query -> { revenue: '1000', bookings: '10' }
      // taskRepo query -> { total: '20', completed: '10' }
      // profileRepo count -> 5

      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ revenue: '1000', bookings: '10' }) // Metrics result
        .mockResolvedValueOnce({ total: '20', completed: '10' }); // Task result

      mockRepository.count.mockResolvedValueOnce(5); // Profile count

      const result = await service.getKpiSummary();

      expect(metricsRepo.createQueryBuilder).toHaveBeenCalledWith('m');
      expect(metricsRepo.createQueryBuilder).toHaveBeenCalledWith('m');

      expect(result).toEqual({
        totalRevenue: 1000,
        totalBookings: 10,
        taskCompletionRate: 50,
        averageBookingValue: 100, // 1000 / 10
        activeStaffCount: 5,
      });
    });
  });

  describe('getRevenueSummary', () => {
    it('should return revenue stats', async () => {
      const mockStats = [
        { month: '2023-01', revenue: '1000', payouts: '200' },
        { month: '2023-02', revenue: '1500', payouts: '300' },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(mockStats);

      const result = await service.getRevenueSummary();

      expect(transactionRepo.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(mockQueryBuilder.setParameter).toHaveBeenCalledWith(
        'income',
        TransactionType.INCOME,
      );
      expect(result).toEqual([
        { month: '2023-01', revenue: 1000, payouts: 200, net: 800 },
        { month: '2023-02', revenue: 1500, payouts: 300, net: 1200 },
      ]);
    });
    it('should handle null values in revenue stats', async () => {
      const mockStats = [{ month: '2023-01', revenue: null, payouts: null }];
      mockQueryBuilder.getRawMany.mockResolvedValue(mockStats);

      const result = await service.getRevenueSummary();

      expect(result).toEqual([
        { month: '2023-01', revenue: 0, payouts: 0, net: 0 },
      ]);
    });
  });

  describe('getStaffPerformance', () => {
    it('should return staff performance stats', async () => {
      const mockStats = [
        {
          staffName: 'John Doe',
          completedTasks: '10',
          totalCommission: '500',
        },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(mockStats);

      const result = await service.getStaffPerformance();

      expect(taskRepo.createQueryBuilder).toHaveBeenCalledWith('task');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'task.tenantId = :tenantId',
        { tenantId: 'tenant-123' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.status = :status',
        { status: TaskStatus.COMPLETED },
      );
      expect(result).toEqual([
        { staffName: 'John Doe', completedTasks: 10, totalCommission: 500 },
      ]);
    });

    it('should handle null values in staff performance', async () => {
      const mockStats = [
        {
          staffName: null,
          completedTasks: null,
          totalCommission: null,
        },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(mockStats);

      const result = await service.getStaffPerformance();

      expect(result).toEqual([
        { staffName: 'Unknown Staff', completedTasks: 0, totalCommission: 0 },
      ]);
    });
  });

  describe('getPackageStats', () => {
    it('should return package stats', async () => {
      const mockStats = [
        {
          packageName: 'Wedding Package',
          bookingCount: '5',
          totalRevenue: '5000',
        },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(mockStats);

      const result = await service.getPackageStats();

      expect(bookingRepo.createQueryBuilder).toHaveBeenCalledWith('b');
      expect(result).toEqual([
        {
          packageName: 'Wedding Package',
          bookingCount: 5,
          totalRevenue: 5000,
        },
      ]);
    });

    it('should handle null values in package stats', async () => {
      const mockStats = [
        {
          packageName: 'Pkg',
          bookingCount: null,
          totalRevenue: null,
        },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(mockStats);

      const result = await service.getPackageStats();

      expect(result).toEqual([
        {
          packageName: 'Pkg',
          bookingCount: 0,
          totalRevenue: 0,
        },
      ]);
    });
  });
});
