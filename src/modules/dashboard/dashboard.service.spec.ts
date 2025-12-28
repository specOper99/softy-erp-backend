import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Profile } from '../hr/entities/profile.entity';
import { Task } from '../tasks/entities/task.entity';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let transactionRepository: Repository<Transaction>;
  let taskRepository: Repository<Task>;
  let bookingRepository: Repository<Booking>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Task),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    taskRepository = module.get<Repository<Task>>(getRepositoryToken(Task));
    bookingRepository = module.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRevenueSummary', () => {
    it('should return revenue summary stats', async () => {
      const mockStats = [{ month: '2023-01', revenue: '1000', payouts: '200' }];

      const createQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockStats),
      };

      jest
        .spyOn(transactionRepository, 'createQueryBuilder')
        .mockReturnValue(createQueryBuilder);

      const result = await service.getRevenueSummary();

      expect(result).toEqual([
        { month: '2023-01', revenue: 1000, payouts: 200, net: 800 },
      ]);
    });

    it('should handle empty results', async () => {
      const createQueryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(transactionRepository, 'createQueryBuilder')
        .mockReturnValue(createQueryBuilder);

      const result = await service.getRevenueSummary();

      expect(result).toEqual([]);
    });
  });

  describe('getStaffPerformance', () => {
    it('should return staff performance stats', async () => {
      const mockStats = [
        { staffName: 'John Doe', completedTasks: '5', totalCommission: '500' },
      ];

      const createQueryBuilder: any = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockStats),
      };

      jest
        .spyOn(taskRepository, 'createQueryBuilder')
        .mockReturnValue(createQueryBuilder);

      const result = await service.getStaffPerformance();

      expect(result).toEqual([
        { staffName: 'John Doe', completedTasks: 5, totalCommission: 500 },
      ]);
    });
  });

  describe('getPackageStats', () => {
    it('should return package stats', async () => {
      const mockStats = [
        { packageName: 'Premium', bookingCount: '10', totalRevenue: '5000' },
      ];

      const createQueryBuilder: any = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockStats),
      };

      jest
        .spyOn(bookingRepository, 'createQueryBuilder')
        .mockReturnValue(createQueryBuilder);

      const result = await service.getPackageStats();

      expect(result).toEqual([
        { packageName: 'Premium', bookingCount: 10, totalRevenue: 5000 },
      ]);
    });
  });
});
