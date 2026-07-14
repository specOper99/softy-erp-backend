import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Repository, SelectQueryBuilder } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import type { Booking } from '../../bookings/domain/entities/booking.entity';
import { BookingRepository } from '../../bookings/infrastructure/booking.repository';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let bookingRepo: jest.Mocked<Repository<Booking>>;

  const mockTenantId = 'tenant-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: BookingRepository,
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
    bookingRepo = module.get(BookingRepository);

    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as unknown as SelectQueryBuilder<Booking>);

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
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as unknown as SelectQueryBuilder<Booking>);

      const result = await service.getTaxReport('2024-01-01', '2024-12-31');

      expect(result.totalTax).toBe(0);
      expect(result.totalSubTotal).toBe(0);
      expect(result.totalGross).toBe(0);
    });

    it('should sanitize invalid aggregate values', async () => {
      const mockRawResult = {
        totalTax: 'Infinity',
        totalSubTotal: 'NaN',
        totalGross: '1e309',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(mockRawResult),
      };
      bookingRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as unknown as SelectQueryBuilder<Booking>);

      const result = await service.getTaxReport('2024-01-01', '2024-12-31');

      expect(result.totalTax).toBe(0);
      expect(result.totalSubTotal).toBe(0);
      expect(result.totalGross).toBe(0);
    });
  });
});
