import { OutboxMailConsumer, CONSUMER_NAME } from './outbox-mail.consumer';
import type { OutboxEventEnvelope } from '../../../common/events/outbox-envelope';
import { DURABLE_MAIL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { TenantContextService } from '../../../common/services/tenant-context.service';

describe('OutboxMailConsumer', () => {
  const envelope: OutboxEventEnvelope = {
    eventId: 'evt-mail-1',
    eventType: 'BookingConfirmedEvent',
    eventVersion: 1,
    tenantId: 'tenant-1',
    aggregateType: 'booking',
    aggregateId: 'booking-1',
    occurredAt: '2030-01-01T10:00:00.000Z',
    payload: {
      bookingId: 'booking-1',
      clientName: 'Ada',
      clientEmail: 'ada@example.com',
      eventDate: '2030-06-15T00:00:00.000Z',
      packageName: 'Premium',
      totalPrice: 1000,
    },
    correlationId: null,
  };

  let consumer: OutboxMailConsumer;
  let consumerInbox: { tryClaim: jest.Mock; recordProcessed: jest.Mock };
  let mailService: {
    sendBookingConfirmation: jest.Mock;
    sendCancellationEmail: jest.Mock;
    sendBookingRescheduleNotification: jest.Mock;
    sendPaymentReceipt: jest.Mock;
    sendTaskAssignment: jest.Mock;
  };
  let flagsService: { isEnabled: jest.Mock };
  let manager: Record<string, never>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    manager = {};
    consumerInbox = {
      tryClaim: jest.fn().mockResolvedValue(true),
      recordProcessed: jest.fn().mockResolvedValue(undefined),
    };
    mailService = {
      sendBookingConfirmation: jest.fn().mockResolvedValue({ success: true, email: 'ada@example.com' }),
      sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
      sendBookingRescheduleNotification: jest.fn().mockResolvedValue({ success: true, email: 'staff@example.com' }),
      sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
      sendTaskAssignment: jest.fn().mockResolvedValue({ success: true, email: 'emp@example.com' }),
    };
    flagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) => cb(manager)),
    };

    consumer = new OutboxMailConsumer(
      dataSource as never,
      consumerInbox as never,
      mailService as never,
      flagsService as never,
    );

    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, cb) => cb());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends mail and records inbox on first delivery', async () => {
    await consumer.process(envelope);

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_MAIL_EVENTS_FLAG, {}, true);
    expect(consumerInbox.tryClaim).toHaveBeenCalledWith(CONSUMER_NAME, envelope.eventId, manager);
    expect(mailService.sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-1',
        clientEmail: 'ada@example.com',
        clientName: 'Ada',
        packageName: 'Premium',
        totalPrice: 1000,
      }),
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalledWith(CONSUMER_NAME, envelope.eventId, manager);
  });

  it('skips send on inbox dedupe (duplicate eventId)', async () => {
    consumerInbox.tryClaim.mockResolvedValue(false);

    await consumer.process(envelope);

    expect(mailService.sendBookingConfirmation).not.toHaveBeenCalled();
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('throws on mail failure so BullMQ can retry (inbox not recorded)', async () => {
    const failure = new Error('SMTP unavailable');
    mailService.sendBookingConfirmation.mockRejectedValue(failure);

    await expect(consumer.process(envelope)).rejects.toThrow('SMTP unavailable');
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('no-ops when durable mail kill switch is off', async () => {
    flagsService.isEnabled.mockReturnValue(false);

    await consumer.process(envelope);

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
    expect(mailService.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it('throws when tenantId is missing', async () => {
    await expect(consumer.process({ ...envelope, tenantId: null })).rejects.toThrow(/missing tenantId/);
  });

  it('ignores non-mail event types', async () => {
    await consumer.process({ ...envelope, eventType: 'BookingCreatedEvent' });

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
    expect(mailService.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it('dispatches payment receipt for PaymentRecordedEvent', async () => {
    await consumer.process({
      ...envelope,
      eventType: 'PaymentRecordedEvent',
      payload: {
        bookingId: 'booking-1',
        clientName: 'Ada',
        clientEmail: 'ada@example.com',
        eventDate: '2030-06-15T00:00:00.000Z',
        amount: 250,
        paymentMethod: 'Card',
        reference: 'ref-1',
        totalPrice: 1000,
        amountPaid: 250,
      },
    });

    expect(mailService.sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-1',
        to: 'ada@example.com',
        amount: 250,
        paymentMethod: 'Card',
      }),
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalled();
  });
});
