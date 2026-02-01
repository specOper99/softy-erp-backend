import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Payout } from '../entities/payout.entity';
import { PayoutStatus } from '../enums/payout-status.enum';

@Injectable()
export class PayoutRepository extends TenantAwareRepository<Payout> {
  constructor(
    @InjectRepository(Payout)
    repository: Repository<Payout>,
  ) {
    super(repository);
  }

  /**
   * Find payouts stuck in PENDING state for longer than the specified duration.
   * This is tenant-scoped - only returns payouts for the current tenant.
   */
  async findStuckPayouts(olderThanMinutes: number, limit = 100): Promise<Payout[]> {
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    return this.find({
      where: {
        status: PayoutStatus.PENDING,
        payoutDate: LessThan(cutoffDate),
      },
      take: limit,
      order: { payoutDate: 'ASC' },
    });
  }

  /**
   * Count stuck payouts for the current tenant.
   */
  async countStuckPayouts(olderThanMinutes: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    return this.count({
      where: {
        status: PayoutStatus.PENDING,
        payoutDate: LessThan(cutoffDate),
      },
    });
  }

  /**
   * Find stale payouts older than the specified hours.
   * Used by reconciliation jobs.
   */
  async findStalePayouts(olderThanHours: number): Promise<Payout[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    return this.find({
      where: {
        status: PayoutStatus.PENDING,
        payoutDate: LessThan(cutoffDate),
      },
      order: { payoutDate: 'ASC' },
    });
  }
}
