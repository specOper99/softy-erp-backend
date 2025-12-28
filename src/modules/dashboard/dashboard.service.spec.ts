import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskStatus, TransactionType } from '../../common/enums';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Profile } from '../hr/entities/profile.entity';
import { Task } from '../tasks/entities/task.entity';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let transactionRepo: Repository<Transaction>;
  let taskRepo: Repository<Task>;
  let bookingRepo: Repository<Booking>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    transactionRepo = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    taskRepo = module.get<Repository<Task>>(getRepositoryToken(Task));
    bookingRepo = module.get<Repository<Booking>>(getRepositoryToken(Booking));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
        'task.status = :status',
        { status: TaskStatus.COMPLETED },
      );
      expect(result).toEqual([
        { staffName: 'John Doe', completedTasks: 10, totalCommission: 500 },
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
  });
});
