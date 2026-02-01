import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { DailyMetrics } from '../entities/daily-metrics.entity';

@Injectable()
export class DailyMetricsRepository extends TenantAwareRepository<DailyMetrics> {
  constructor(
    @InjectRepository(DailyMetrics)
    repository: Repository<DailyMetrics>,
  ) {
    super(repository);
  }
}
