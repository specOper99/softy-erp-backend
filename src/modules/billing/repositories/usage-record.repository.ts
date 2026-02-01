import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { UsageRecord } from '../entities/usage-record.entity';

@Injectable()
export class UsageRecordRepository extends TenantAwareRepository<UsageRecord> {
  constructor(
    @InjectRepository(UsageRecord)
    repository: Repository<UsageRecord>,
  ) {
    super(repository);
  }
}
