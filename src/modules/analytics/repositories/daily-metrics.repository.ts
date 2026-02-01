import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
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

  async insert(entity: DeepPartial<DailyMetrics>): Promise<void> {
    await this.repository.insert(entity);
  }

  async increment(criteria: Partial<DailyMetrics>, propertyPath: string, value: number): Promise<void> {
    await this.repository.increment(criteria, propertyPath, value);
  }
}
