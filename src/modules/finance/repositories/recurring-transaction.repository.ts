import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { RecurringTransaction } from '../entities/recurring-transaction.entity';

@Injectable()
export class RecurringTransactionRepository extends TenantAwareRepository<RecurringTransaction> {
  constructor(
    @InjectRepository(RecurringTransaction)
    repository: Repository<RecurringTransaction>,
  ) {
    super(repository);
  }
}
