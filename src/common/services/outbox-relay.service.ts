import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { ConsumerInbox } from '../entities/consumer-inbox.entity';
import { OutboxEvent, OutboxStatus } from '../entities/outbox-event.entity';
import {
  durableCategoriesForEventType,
  isFinancialOutboxEventType,
  isInvoiceOutboxEventType,
  isMailOutboxEventType,
  isNotificationOutboxEventType,
  isWebhookOutboxEventType,
  killSwitchFlagForCategory,
  OUTBOX_EVENTS_QUEUE,
  type DurableOutboxCategory,
  type OutboxEventEnvelope,
} from '../events/outbox-envelope';
import { FlagsService } from '../flags/flags.service';
import {
  OUTBOX_FINANCIAL_CONSUMER,
  OUTBOX_INVOICE_CONSUMER,
  OUTBOX_MAIL_CONSUMER,
  OUTBOX_NOTIFICATION_CONSUMER,
  OUTBOX_WEBHOOK_CONSUMER,
  type OutboxFinancialConsumerPort,
  type OutboxInvoiceConsumerPort,
  type OutboxMailConsumerPort,
  type OutboxNotificationConsumerPort,
  type OutboxWebhookConsumerPort,
} from '../outbox/outbox-consumer.port';
import { toErrorMessage } from '../utils/error.util';

/** Explicit FAILED reason when all durable category kill switches are off at relay time. */
export const KILL_SWITCH_SKIP_REASON = 'skipped: durable kill switch off';

const MAX_RELAY_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 60_000;
const BATCH_SIZE = 50;

function backoffMs(attempt: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly instanceId = process.env.HOSTNAME ?? `pid-${process.pid}`;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    @Optional() @InjectQueue(OUTBOX_EVENTS_QUEUE) private readonly outboxQueue?: Queue,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox(): Promise<void> {
    if (!this.outboxQueue) {
      return;
    }

    try {
      await this.processBatch();
    } catch (error: unknown) {
      this.logger.error(`outbox-relay: processBatch failed: ${toErrorMessage(error)}`);
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();

    const events = await this.dataSource.transaction(async (manager) => {
      const outboxRepository = manager.getRepository(OutboxEvent);
      const claimedEvents = await outboxRepository
        .createQueryBuilder('event')
        .where('event.status = :status', { status: OutboxStatus.PENDING })
        .andWhere('(event.nextAttemptAt IS NULL OR event.nextAttemptAt <= :now)', { now })
        .andWhere('(event.claimLeaseExpiresAt IS NULL OR event.claimLeaseExpiresAt <= :now)', { now })
        .orderBy('event.createdAt', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      const claimLeaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS);
      for (const event of claimedEvents) {
        event.claimedBy = this.instanceId;
        event.claimLeaseExpiresAt = claimLeaseExpiresAt;
      }
      await outboxRepository.save(claimedEvents);

      return claimedEvents;
    });

    if (events.length === 0) {
      return;
    }

    this.logger.log(`Claimed ${events.length} pending outbox events`);

    for (const event of events) {
      await this.relayOne(event);
    }
  }

  private isDurableRelayEnabled(eventType: string): boolean {
    const categories = durableCategoriesForEventType(eventType);
    if (categories.length === 0) {
      return true;
    }
    // Event may belong to multiple categories; relay if any category kill switch is on.
    return categories.some((category) => {
      const flag = killSwitchFlagForCategory(category);
      return this.flagsService?.isEnabled(flag, {}, true) ?? true;
    });
  }

  private async relayOne(event: OutboxEvent): Promise<void> {
    if (!this.outboxQueue) {
      return;
    }

    const envelope = this.toEnvelope(event);

    if (!this.isDurableRelayEnabled(envelope.eventType)) {
      // All categories OFF: mark FAILED with explicit reason so ops can
      // `outbox:dlq-replay --reason kill-switch` after a mistaken flip.
      // When any category is still ON, isDurableRelayEnabled stays true and we relay.
      event.status = OutboxStatus.FAILED;
      event.error = KILL_SWITCH_SKIP_REASON;
      event.claimedBy = null;
      event.claimLeaseExpiresAt = null;
      await this.outboxRepository.save(event);
      this.logger.debug(`Skipped durable relay for ${envelope.eventType} (kill switch off)`);
      return;
    }

    event.claimedBy = this.instanceId;
    event.claimLeaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS);

    try {
      await this.outboxQueue.add(envelope.eventType, envelope, {
        jobId: envelope.eventId,
        removeOnComplete: true,
        removeOnFail: false,
      });

      event.status = OutboxStatus.DISPATCHED;
      event.dispatchedAt = new Date();
      event.error = null;
      this.logger.log(`Dispatched ${envelope.eventType} (${envelope.eventId}) to BullMQ`);
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      event.retryCount = (event.retryCount ?? 0) + 1;
      event.error = message;
      event.nextAttemptAt = new Date(Date.now() + backoffMs(event.retryCount));

      if (event.retryCount >= MAX_RELAY_ATTEMPTS) {
        event.status = OutboxStatus.DEAD_LETTER;
        event.deadLetteredAt = new Date();
        this.logger.error(`Outbox event ${event.id} dead-lettered after ${MAX_RELAY_ATTEMPTS} attempts: ${message}`);
      } else {
        this.logger.warn(
          `Outbox relay attempt ${event.retryCount}/${MAX_RELAY_ATTEMPTS} failed for ${event.id}: ${message}`,
        );
      }
    }

    await this.outboxRepository.save(event);
  }

  toEnvelope(event: OutboxEvent): OutboxEventEnvelope {
    const payload = event.payload ?? {};
    const tenantFromPayload =
      typeof payload.tenantId === 'string' && payload.tenantId.trim() !== '' ? payload.tenantId.trim() : null;

    return {
      eventId: event.id,
      eventType: event.type,
      eventVersion: event.eventVersion ?? 1,
      tenantId: event.tenantId ?? tenantFromPayload,
      aggregateType: event.aggregateType ?? 'unknown',
      aggregateId: event.aggregateId,
      occurredAt: (event.occurredAt ?? event.createdAt).toISOString(),
      payload,
      correlationId: event.correlationId ?? null,
    };
  }
}

type BullmqJob = Parameters<WorkerHost['process']>[0];

/**
 * Routes dispatched outbox envelopes to domain consumers.
 * Idempotency: consumers use ConsumerInboxService inside their transaction.
 */
@Processor(OUTBOX_EVENTS_QUEUE)
export class OutboxEventProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxEventProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly flagsService?: FlagsService,
    @Optional()
    @Inject(OUTBOX_NOTIFICATION_CONSUMER)
    private readonly notificationConsumer?: OutboxNotificationConsumerPort,
    @Optional()
    @Inject(OUTBOX_MAIL_CONSUMER)
    private readonly mailConsumer?: OutboxMailConsumerPort,
    @Optional()
    @Inject(OUTBOX_WEBHOOK_CONSUMER)
    private readonly webhookConsumer?: OutboxWebhookConsumerPort,
    @Optional()
    @Inject(OUTBOX_FINANCIAL_CONSUMER)
    private readonly financialConsumer?: OutboxFinancialConsumerPort,
    @Optional()
    @Inject(OUTBOX_INVOICE_CONSUMER)
    private readonly invoiceConsumer?: OutboxInvoiceConsumerPort,
  ) {
    super();
  }

  private isCategoryEnabled(category: DurableOutboxCategory): boolean {
    const flag = killSwitchFlagForCategory(category);
    return this.flagsService?.isEnabled(flag, {}, true) ?? true;
  }

  async process(job: BullmqJob, _token?: string): Promise<void> {
    const envelope = job.data as OutboxEventEnvelope;
    this.logger.log(`Processing outbox job ${job.id}: ${envelope.eventType}`);

    let handled = false;

    if (isFinancialOutboxEventType(envelope.eventType) && this.isCategoryEnabled('financial')) {
      if (this.financialConsumer) {
        await this.financialConsumer.process(envelope);
      } else {
        await this.recordInboxOnly('outbox-financial-consumer', envelope);
      }
      handled = true;
    }

    if (isInvoiceOutboxEventType(envelope.eventType) && this.isCategoryEnabled('invoice')) {
      if (this.invoiceConsumer) {
        await this.invoiceConsumer.process(envelope);
      } else {
        await this.recordInboxOnly('outbox-invoice-consumer', envelope);
      }
      handled = true;
    }

    if (
      isNotificationOutboxEventType(envelope.eventType) &&
      this.notificationConsumer &&
      this.isCategoryEnabled('notification')
    ) {
      await this.notificationConsumer.process(envelope);
      handled = true;
    }

    if (isMailOutboxEventType(envelope.eventType) && this.isCategoryEnabled('mail')) {
      if (this.mailConsumer) {
        await this.mailConsumer.process(envelope);
      } else {
        await this.recordInboxOnly('outbox-mail-router', envelope);
      }
      handled = true;
    }

    if (isWebhookOutboxEventType(envelope.eventType) && this.isCategoryEnabled('webhook')) {
      if (this.webhookConsumer) {
        await this.webhookConsumer.process(envelope);
      } else {
        await this.recordInboxOnly('outbox-webhook-router', envelope);
      }
      handled = true;
    }

    if (!handled) {
      this.logger.warn(`No durable consumer registered for ${envelope.eventType}`);
    }
  }

  private async recordInboxOnly(consumerName: string, envelope: OutboxEventEnvelope): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const inboxRepo = manager.getRepository(ConsumerInbox);
      const existing = await inboxRepo.findOne({
        where: { consumerName, eventId: envelope.eventId },
      });
      if (existing) {
        this.logger.debug(`Duplicate outbox event ${envelope.eventId} — skipping`);
        return;
      }

      await inboxRepo.save({
        consumerName,
        eventId: envelope.eventId,
      });
    });
  }
}
