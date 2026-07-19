import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DURABLE_INVOICE_EVENTS_FLAG,
  isInvoiceOutboxEventType,
  type OutboxEventEnvelope,
} from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { ConsumerInboxService } from '../../../common/services/consumer-inbox.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { InvoiceService } from '../application/invoice.service';

export const CONSUMER_NAME = 'outbox-invoice-consumer';

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

@Injectable()
export class OutboxInvoiceGenerationConsumer {
  private readonly logger = new Logger(OutboxInvoiceGenerationConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly consumerInbox: ConsumerInboxService,
    private readonly invoiceService: InvoiceService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  /**
   * Creates an invoice for a confirmed booking (eventually consistent).
   * Throws on failure so BullMQ retries; inbox recorded only after success.
   * createInvoice is idempotent (returns existing for bookingId).
   */
  async process(envelope: OutboxEventEnvelope): Promise<void> {
    if (!isInvoiceOutboxEventType(envelope.eventType)) {
      return;
    }

    if (!(this.flagsService?.isEnabled(DURABLE_INVOICE_EVENTS_FLAG, {}, true) ?? true)) {
      this.logger.debug(`Durable invoice kill switch off — skipping ${envelope.eventId}`);
      return;
    }

    const tenantId = envelope.tenantId;
    if (!tenantId) {
      throw new Error(`Invoice outbox event ${envelope.eventId} missing tenantId`);
    }

    const bookingId = asString(envelope.payload.bookingId, envelope.aggregateId);
    if (!bookingId) {
      throw new Error(`Invoice outbox event ${envelope.eventId} missing bookingId`);
    }

    await TenantContextService.run(tenantId, async () =>
      this.dataSource.transaction(async (manager) => {
        const claimed = await this.consumerInbox.tryClaim(CONSUMER_NAME, envelope.eventId, manager);
        if (!claimed) {
          this.logger.debug(`Duplicate invoice outbox event ${envelope.eventId} — skipping`);
          return;
        }

        await this.invoiceService.createInvoice(bookingId);

        await this.consumerInbox.recordProcessed(CONSUMER_NAME, envelope.eventId, manager);
        this.logger.log(`Invoice generated for booking ${bookingId} (${envelope.eventId})`);
      }),
    );
  }
}
