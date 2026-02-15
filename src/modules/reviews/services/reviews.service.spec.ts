import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MockRepository, createMockRepository } from '../../../../test/helpers/mock-factories';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../enums/review-status.enum';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewRepository: MockRepository<Review>;

  beforeEach(async () => {
    reviewRepository = createMockRepository<Review>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getRepositoryToken(Review),
          useValue: reviewRepository,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('getApprovedAggregatesByPackageIds', () => {
    it('returns expected stats keyed by packageId', async () => {
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { packageId: 'pkg-1', avgRating: '4.5', reviewCount: '2' },
          { packageId: 'pkg-2', avgRating: '5', reviewCount: '1' },
        ]),
      };
      reviewRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.getApprovedAggregatesByPackageIds('tenant-1', ['pkg-1', 'pkg-2']);

      expect(reviewRepository.createQueryBuilder).toHaveBeenCalledWith('review');
      expect(queryBuilder.where).toHaveBeenCalledWith('review.tenantId = :tenantId', { tenantId: 'tenant-1' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('review.status = :status', { status: ReviewStatus.APPROVED });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('review.packageId IN (:...packageIds)', {
        packageIds: ['pkg-1', 'pkg-2'],
      });
      expect(result).toEqual([
        { packageId: 'pkg-1', avgRating: 4.5, reviewCount: 2 },
        { packageId: 'pkg-2', avgRating: 5, reviewCount: 1 },
      ]);
    });

    it('handles empty package id list safely', async () => {
      const result = await service.getApprovedAggregatesByPackageIds('tenant-1', []);

      expect(result).toEqual([]);
      expect(reviewRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
