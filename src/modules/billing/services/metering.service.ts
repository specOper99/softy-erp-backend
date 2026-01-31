import { Injectable, Logger } from '@nestjs/common';
import { UsageMetric, UsageRecord } from '../entities/usage-record.entity';
import { UsageRecordRepository } from '../repositories/usage-record.repository';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class MeteringService {
  private readonly logger = new Logger(MeteringService.name);

  constructor(
    private readonly usageRecordRepo: UsageRecordRepository,
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async recordUsage(
    tenantId: string,
    metric: UsageMetric,
    quantity: number,
    metadata?: Record<string, unknown>,
  ): Promise<UsageRecord> {
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);

    const record = this.usageRecordRepo.create({
      tenantId,
      metric,
      quantity,
      periodStart,
      periodEnd,
      metadata,
    });

    const subscription = await this.subscriptionService.getSubscription(tenantId);
    if (subscription) {
      record.subscriptionId = subscription.id;
    }

    const savedRecord = await this.usageRecordRepo.save(record);

    this.syncToStripe(savedRecord).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Failed to sync usage to Stripe: ${message}`, stack);
    });

    return savedRecord;
  }

  async getUsageSummary(tenantId: string, periodStart: Date, periodEnd: Date): Promise<Record<UsageMetric, number>> {
    const records = await this.usageRecordRepo
      .createQueryBuilder('record')
      .select('record.metric', 'metric')
      .addSelect('SUM(record.quantity)', 'total')
      .where('record.periodStart >= :periodStart', { periodStart })
      .andWhere('record.periodEnd <= :periodEnd', { periodEnd })
      .groupBy('record.metric')
      .getRawMany<{ metric: UsageMetric; total: string }>();

    const summary: Partial<Record<UsageMetric, number>> = {};
    for (const record of records) {
      summary[record.metric] = parseInt(record.total, 10);
    }

    return summary as Record<UsageMetric, number>;
  }

  private syncToStripe(record: UsageRecord): Promise<void> {
    if (!this.stripeService.isConfigured()) return Promise.resolve();

    this.logger.debug(`Mock sync to Stripe for metric ${record.metric} quantity ${record.quantity}`);

    return Promise.resolve();
  }
}
