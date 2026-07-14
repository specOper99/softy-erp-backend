import { Injectable, Logger, Optional } from '@nestjs/common';
import { format } from 'date-fns';
import { DataSource } from 'typeorm';
import {
  DURABLE_FINANCIAL_EVENTS_FLAG,
  isFinancialOutboxEventType,
  type OutboxEventEnvelope,
} from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { ConsumerInboxService } from '../../../common/services/consumer-inbox.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { isDuplicateKeyError } from '../../../common/utils/error.util';
import { DailyMetricsRepository } from './daily-metrics.repository';

export const CONSUMER_NAME = 'outbox-financial-consumer';

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

@Injectable()
export class OutboxFinancialConsumer {
  private readonly logger = new Logger(OutboxFinancialConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly consumerInbox: ConsumerInboxService,
    private readonly metricsRepository: DailyMetricsRepository,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  /**
   * Process a durable financial outbox envelope (payment/refund metrics).
   * Throws on failure so BullMQ retries; inbox row is only recorded after successful metrics write.
   */
  async process(envelope: OutboxEventEnvelope): Promise<void> {
    if (!isFinancialOutboxEventType(envelope.eventType)) {
      return;
    }

    if (!(this.flagsService?.isEnabled(DURABLE_FINANCIAL_EVENTS_FLAG, {}, true) ?? true)) {
      this.logger.debug(`Durable financial kill switch off — skipping ${envelope.eventId}`);
      return;
    }

    const tenantId = envelope.tenantId;
    if (!tenantId) {
      throw new Error(`Financial outbox event ${envelope.eventId} missing tenantId`);
    }

    await TenantContextService.run(tenantId, async () =>
      this.dataSource.transaction(async (manager) => {
        const claimed = await this.consumerInbox.tryClaim(CONSUMER_NAME, envelope.eventId, manager);
        if (!claimed) {
          this.logger.debug(`Duplicate financial outbox event ${envelope.eventId} — skipping`);
          return;
        }

        await this.dispatchMetrics(tenantId, envelope);

        await this.consumerInbox.recordProcessed(CONSUMER_NAME, envelope.eventId, manager);
        this.logger.log(`Outbox financial metrics applied for ${envelope.eventType} (${envelope.eventId})`);
      }),
    );
  }

  private async dispatchMetrics(tenantId: string, envelope: OutboxEventEnvelope): Promise<void> {
    const amount = asNumber(envelope.payload.amount);
    const dateStr = format(new Date(envelope.occurredAt), 'yyyy-MM-dd');

    switch (envelope.eventType) {
      case 'PaymentRecordedEvent':
        await this.applyRevenueDelta(tenantId, dateStr, amount);
        return;
      case 'RefundRecordedEvent':
        await this.applyRevenueDelta(tenantId, dateStr, -Math.abs(amount));
        return;
      default:
        this.logger.warn(`No financial metrics mapping for ${envelope.eventType}`);
    }
  }

  private async applyRevenueDelta(tenantId: string, date: string, totalRevenue: number): Promise<void> {
    if (totalRevenue === 0) return;

    try {
      await this.metricsRepository.insert({
        tenantId,
        date,
        bookingsCount: 0,
        tasksCompletedCount: 0,
        activeClientsCount: 0,
        cancellationsCount: 0,
        totalRevenue,
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      await this.metricsRepository.increment({ tenantId, date }, 'totalRevenue', totalRevenue);
    }
  }
}
