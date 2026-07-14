import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DURABLE_MAIL_EVENTS_FLAG,
  isMailOutboxEventType,
  type OutboxEventEnvelope,
} from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { ConsumerInboxService } from '../../../common/services/consumer-inbox.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MailService } from '../application/mail.service';

export const CONSUMER_NAME = 'outbox-mail-consumer';

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v) => v !== '');
}

@Injectable()
export class OutboxMailConsumer {
  private readonly logger = new Logger(OutboxMailConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly consumerInbox: ConsumerInboxService,
    private readonly mailService: MailService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  /**
   * Process a durable mail outbox envelope.
   * Throws on failure so BullMQ retries; inbox row is only recorded after successful send/queue.
   */
  async process(envelope: OutboxEventEnvelope): Promise<void> {
    if (!isMailOutboxEventType(envelope.eventType)) {
      return;
    }

    if (!(this.flagsService?.isEnabled(DURABLE_MAIL_EVENTS_FLAG, {}, true) ?? true)) {
      this.logger.debug(`Durable mail kill switch off — skipping ${envelope.eventId}`);
      return;
    }

    const tenantId = envelope.tenantId;
    if (!tenantId) {
      throw new Error(`Mail outbox event ${envelope.eventId} missing tenantId`);
    }

    await TenantContextService.run(tenantId, async () =>
      this.dataSource.transaction(async (manager) => {
        const claimed = await this.consumerInbox.tryClaim(CONSUMER_NAME, envelope.eventId, manager);
        if (!claimed) {
          this.logger.debug(`Duplicate mail outbox event ${envelope.eventId} — skipping`);
          return;
        }

        // Throws → transaction rolls back → inbox not recorded → BullMQ can retry.
        await this.dispatchMail(envelope);

        await this.consumerInbox.recordProcessed(CONSUMER_NAME, envelope.eventId, manager);
        this.logger.log(`Outbox mail dispatched for ${envelope.eventType} (${envelope.eventId})`);
      }),
    );
  }

  private async dispatchMail(envelope: OutboxEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    const bookingId = asString(payload.bookingId, envelope.aggregateId);

    switch (envelope.eventType) {
      case 'BookingConfirmedEvent':
        await this.mailService.sendBookingConfirmation({
          clientName: asString(payload.clientName, 'Client'),
          clientEmail: asString(payload.clientEmail),
          eventDate: asDate(payload.eventDate),
          packageName: asString(payload.packageName, 'Service Package'),
          totalPrice: asNumber(payload.totalPrice),
          bookingId,
        });
        return;

      case 'BookingCancelledEvent':
        await this.mailService.sendCancellationEmail({
          clientName: asString(payload.clientName, 'Client'),
          to: asString(payload.clientEmail),
          bookingId,
          eventDate: asDate(payload.eventDate),
          cancelledAt: asDate(payload.cancelledAt),
          daysBeforeEvent: asNumber(payload.daysBeforeEvent),
          cancellationReason: asString(payload.cancellationReason),
          amountPaid: asNumber(payload.amountPaid),
          refundAmount: asNumber(payload.refundAmount),
          refundPercentage: asNumber(payload.refundPercentage),
        });
        return;

      case 'BookingRescheduledEvent': {
        const staffEmails = asStringArray(payload.staffEmails);
        const eventDate = asDate(payload.eventDate);
        const startTime =
          payload.startTime === null || payload.startTime === undefined ? null : asString(payload.startTime);
        for (const staffEmail of staffEmails) {
          await this.mailService.sendBookingRescheduleNotification({
            employeeEmail: staffEmail,
            employeeName: staffEmail,
            bookingId,
            eventDate,
            startTime,
          });
        }
        return;
      }

      case 'PaymentRecordedEvent':
        await this.mailService.sendPaymentReceipt({
          clientName: asString(payload.clientName, 'Client'),
          to: asString(payload.clientEmail),
          bookingId,
          eventDate: asDate(payload.eventDate),
          amount: asNumber(payload.amount),
          paymentMethod: asString(payload.paymentMethod, 'Manual'),
          reference: asString(payload.reference),
          totalPrice: asNumber(payload.totalPrice),
          amountPaid: asNumber(payload.amountPaid),
        });
        return;

      case 'TaskAssignedEvent':
        await this.mailService.sendTaskAssignment({
          employeeName: asString(payload.employeeName),
          employeeEmail: asString(payload.employeeEmail),
          processingType: asString(payload.processingTypeName ?? payload.processingType),
          clientName: asString(payload.clientName, 'Client'),
          eventDate: asDate(payload.eventDate),
          commission: asNumber(payload.commission),
        });
        return;

      default:
        this.logger.warn(`No mail dispatch mapping for ${envelope.eventType}`);
    }
  }
}
