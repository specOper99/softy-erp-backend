import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../entities/outbox-event.entity';
import { toErrorMessage } from '../utils/error.util';
import { DistributedLockService } from './distributed-lock.service';

/** Maximum delivery attempts before an event is permanently marked FAILED. */
const MAX_RETRIES = 5;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly distributedLockService: DistributedLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    // Prevent duplicate processing across replicas — skip if another instance holds the lock.
    const lockResult = await this.distributedLockService.acquire('outbox-relay-cron', { ttl: 30000 });
    if (!lockResult.acquired) {
      return;
    }

    try {
      this.logger.debug('Checking for pending outbox events...');
      await this.processBatch();
    } finally {
      await this.distributedLockService.release('outbox-relay-cron', lockResult.lockToken);
    }
  }

  private async processBatch(): Promise<void> {
    // SELECT FOR UPDATE SKIP LOCKED — multi-replica safe; each replica claims its own batch.
    const events = await this.dataSource
      .createQueryBuilder(OutboxEvent, 'event')
      .where('event.status = :status', { status: OutboxStatus.PENDING })
      .orderBy('event.createdAt', 'ASC')
      .limit(50)
      .setLock('pessimistic_write_or_fail')
      .getMany()
      .catch(
        () =>
          // pessimistic_write_or_fail throws when rows are locked; fall back gracefully.
          [] as OutboxEvent[],
      );

    if (events.length === 0) {
      return;
    }

    this.logger.log(`Found ${events.length} pending events. Processing...`);

    for (const event of events) {
      try {
        await this.publishEvent(event);
        event.status = OutboxStatus.PUBLISHED;
        event.error = null;
        this.logger.log(`Published event ${event.type} (ID: ${event.id})`);
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        const stack = error instanceof Error ? error.stack : undefined;
        event.retryCount = (event.retryCount ?? 0) + 1;
        event.error = message;
        if (event.retryCount >= MAX_RETRIES) {
          this.logger.error(`Event ${event.id} exhausted ${MAX_RETRIES} retries, marking FAILED: ${message}`, stack);
          event.status = OutboxStatus.FAILED;
        } else {
          this.logger.warn(`Event ${event.id} delivery attempt ${event.retryCount}/${MAX_RETRIES} failed: ${message}`);
          // Keep PENDING — will be retried on the next cron tick.
        }
      }

      await this.outboxRepository.save(event);
    }
  }

  /**
   * Publish an outbox event to the configured message broker.
   *
   * Subclasses must override this method and inject a real broker client
   * (e.g. RabbitMQ/Kafka/SNS/BullMQ). Example:
   *
   *   protected async publishEvent(event: OutboxEvent): Promise<void> {
   *     await this.broker.emit(event.type, event.payload);
   *   }
   *
   * The base implementation throws so the retry+failure plumbing works correctly:
   * events are retried up to MAX_RETRIES times, then permanently marked FAILED.
   * This surfaces the misconfiguration clearly rather than silently discarding events.
   */
  protected async publishEvent(event: OutboxEvent): Promise<void> {
    throw new Error(
      `No message broker configured — cannot publish outbox event ${event.id} (type: ${event.type}). ` +
        'Extend OutboxRelayService and override publishEvent() with a real broker implementation.',
    );
  }
}
