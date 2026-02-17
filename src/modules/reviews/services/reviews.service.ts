import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewStatusDto } from '../dto/update-review-status.dto';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../enums/review-status.enum';
import { ReviewRepository } from '../repositories/review.repository';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewRepository: ReviewRepository) {}

  async create(clientId: string, bookingId: string, packageId: string, dto: CreateReviewDto): Promise<Review> {
    const review = this.reviewRepository.create({
      clientId,
      bookingId,
      packageId,
      rating: dto.rating,
      comment: dto.comment,
      status: ReviewStatus.PENDING,
    });

    return this.reviewRepository.save(review);
  }

  async findAll(
    filters: {
      status?: ReviewStatus;
      packageId?: string;
      clientId?: string;
    },
    pagination: PaginationDto,
  ): Promise<[Review[], number]> {
    const query = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.client', 'client')
      .leftJoinAndSelect('review.package', 'package')
      .leftJoinAndSelect('review.booking', 'booking');

    if (filters.status) {
      query.andWhere('review.status = :status', { status: filters.status });
    }

    if (filters.packageId) {
      query.andWhere('review.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters.clientId) {
      query.andWhere('review.clientId = :clientId', { clientId: filters.clientId });
    }

    query
      .orderBy('review.createdAt', 'DESC')
      .skip(((pagination.page ?? 1) - 1) * (pagination.limit ?? 10))
      .take(pagination.limit ?? 10);

    return query.getManyAndCount();
  }

  async findApprovedByPackage(packageId: string, pagination: PaginationDto): Promise<[Review[], number]> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;

    return this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.client', 'client')
      .andWhere('review.packageId = :packageId', { packageId })
      .andWhere('review.status = :status', { status: ReviewStatus.APPROVED })
      .orderBy('review.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async getApprovedAggregatesByPackageIds(
    packageIds: string[],
  ): Promise<Array<{ packageId: string; avgRating: number; reviewCount: number }>> {
    if (packageIds.length === 0) {
      return [];
    }

    const rows = await this.reviewRepository
      .createQueryBuilder('review')
      .select('review.packageId', 'packageId')
      .addSelect('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(review.id)', 'reviewCount')
      .andWhere('review.status = :status', { status: ReviewStatus.APPROVED })
      .andWhere('review.packageId IN (:...packageIds)', { packageIds })
      .groupBy('review.packageId')
      .getRawMany<{ packageId: string; avgRating: string; reviewCount: string }>();

    return rows.map((row) => ({
      packageId: row.packageId,
      avgRating: Number.parseFloat(String(row.avgRating ?? 0)),
      reviewCount: Number.parseInt(String(row.reviewCount ?? 0), 10),
    }));
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: ['client', 'package', 'booking'],
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return review;
  }

  async updateStatus(id: string, dto: UpdateReviewStatusDto): Promise<Review> {
    const review = await this.findOne(id);

    review.status = dto.status;

    return this.reviewRepository.save(review);
  }

  async checkDuplicateReview(clientId: string, bookingId: string): Promise<boolean> {
    const existingReview = await this.reviewRepository.findOne({
      where: {
        clientId,
        bookingId,
      },
    });

    return !!existingReview;
  }
}
