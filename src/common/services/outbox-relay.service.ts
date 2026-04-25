import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../entities/outbox-event.entity';

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    this.logger.debug('Checking for pending outbox events...');

    const events = await this.outboxRepository.find({
      where: { status: OutboxStatus.PENDING },
      take: 50,
      order: { createdAt: 'ASC' },
    });

    if (events.length === 0) {
      return;
    }

    this.logger.log(`Found ${events.length} pending events. Processing...`);

    for (const event of events) {
      try {
        await this.publishEvent(event);
        event.status = OutboxStatus.PUBLISHED;
        event.error = undefined;
        this.logger.log(`Published event ${event.type} (ID: ${event.id})`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Failed to publish event ${event.id}: ${message}`, stack);
        event.status = OutboxStatus.FAILED;
        event.error = message;
      }

      await this.outboxRepository.save(event);
    }
  }

  // TODO: Wire up an external message broker (RabbitMQ/Kafka/SNS) here.
  // Until implemented, any events written to the outbox table will be marked FAILED
  // with a clear error, preventing silent data loss.
  private async publishEvent(event: OutboxEvent): Promise<void> {
    throw new Error(
      `No message broker configured. Cannot publish outbox event type=${event.type} id=${event.id}. ` +
        `Implement this method by wiring a broker client and emitting: broker.emit(event.type, event.payload)`,
    );
  }
}
