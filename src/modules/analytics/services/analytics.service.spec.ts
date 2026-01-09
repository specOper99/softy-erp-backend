import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Booking } from '../../bookings/entities/booking.entity';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let bookingRepo: jest.Mocked<Repository<Booking>>;
  let cacheUtils: jest.Mocked<CacheUtilsService>;

  const mockTenantId = 'tenant-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    bookingRepo = module.get(getRepositoryToken(Booking));
    cacheUtils = module.get(CacheUtilsService);

    // Mock tenant context
    jest
      .spyOn(TenantContextService, 'getTenantIdOrThrow')
      .mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRevenueByPackage', () => {
    const mockFilter = { startDate: '2024-01-01', endDate: '2024-12-31' };

    it('should return cached data if available', async () => {
      const cachedData = [
        { packageName: 'Basic', bookingCount: 10, totalRevenue: 5000 },
      ];
      cacheUtils.get.mockResolvedValue(cachedData);

      const result = await service.getRevenueByPackage(mockFilter);

      expect(cacheUtils.get).toHaveBeenCalled();
      expect(result).toEqual(cachedData);
      expect(bookingRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query database and cache result when no cache', async () => {
      const mockRawResult = [
        { packageName: 'Basic', bookingCount: '10', totalRevenue: '5000' },
      ];

      cacheUtils.get.mockResolvedValue(null);

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawResult),
      };
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getRevenueByPackage(mockFilter);

      expect(bookingRepo.createQueryBuilder).toHaveBeenCalledWith('b');
      expect(result[0].packageName).toBe('Basic');
      expect(result[0].bookingCount).toBe(10); // Converted from string
      expect(result[0].totalRevenue).toBe(5000);
      expect(cacheUtils.set).toHaveBeenCalled();
    });

    it('should bypass cache when nocache is true', async () => {
      const mockRawResult = [
        { packageName: 'Premium', bookingCount: '5', totalRevenue: '10000' },
      ];

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawResult),
      };
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getRevenueByPackage(mockFilter, true);

      expect(cacheUtils.get).not.toHaveBeenCalled();
      expect(result[0].packageName).toBe('Premium');
    });
  });

  describe('getTaxReport', () => {
    it('should return tax report data', async () => {
      const mockRawResult = {
        totalTax: '1500.00',
        totalSubTotal: '15000.00',
        totalGross: '16500.00',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(mockRawResult),
      };
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getTaxReport('2024-01-01', '2024-12-31');

      expect(result.totalTax).toBe(1500);
      expect(result.totalSubTotal).toBe(15000);
      expect(result.totalGross).toBe(16500);
      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-12-31');
    });

    it('should return zeros when no data', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getTaxReport('2024-01-01', '2024-12-31');

      expect(result.totalTax).toBe(0);
      expect(result.totalSubTotal).toBe(0);
      expect(result.totalGross).toBe(0);
    });
  });
});
