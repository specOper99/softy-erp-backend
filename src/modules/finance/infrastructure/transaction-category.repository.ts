import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TransactionCategory } from '../domain/entities/transaction-category.entity';

@Injectable()
export class TransactionCategoryRepository extends TenantAwareRepository<TransactionCategory> {
  constructor(
    @InjectRepository(TransactionCategory)
    repository: Repository<TransactionCategory>,
  ) {
    super(repository);
  }
}
