import { Test, TestingModule } from '@nestjs/testing';
import { MockRepository, createMockTenantAwareRepository } from '../../../../test/helpers/mock-factories';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../enums/review-status.enum';
import { ReviewRepository } from '../repositories/review.repository';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewRepository: MockRepository<Review>;

  beforeEach(async () => {
    reviewRepository = createMockTenantAwareRepository<Review>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: ReviewRepository,
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

      const result = await service.getApprovedAggregatesByPackageIds(['pkg-1', 'pkg-2']);

      expect(reviewRepository.createQueryBuilder).toHaveBeenCalledWith('review');
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
      const result = await service.getApprovedAggregatesByPackageIds([]);

      expect(result).toEqual([]);
      expect(reviewRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
