import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Review } from '../entities/review.entity';

@Injectable()
export class ReviewRepository extends TenantAwareRepository<Review> {
  constructor(
    @InjectRepository(Review)
    repository: Repository<Review>,
  ) {
    super(repository);
  }
}
