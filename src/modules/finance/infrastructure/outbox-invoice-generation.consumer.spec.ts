import { OutboxInvoiceGenerationConsumer, CONSUMER_NAME } from './outbox-invoice-generation.consumer';
import type { OutboxEventEnvelope } from '../../../common/events/outbox-envelope';

describe('OutboxInvoiceGenerationConsumer', () => {
  const dataSource = {
    transaction: jest.fn(),
  };
  const consumerInbox = {
    tryClaim: jest.fn(),
    recordProcessed: jest.fn(),
  };
  const invoiceService = {
    createInvoice: jest.fn(),
  };
  const flagsService = {
    isEnabled: jest.fn().mockReturnValue(true),
  };

  let consumer: OutboxInvoiceGenerationConsumer;

  const envelope: OutboxEventEnvelope = {
    eventId: 'evt-1',
    eventType: 'InvoiceGenerationRequested',
    eventVersion: 1,
    tenantId: 'tenant-1',
    aggregateType: 'Booking',
    aggregateId: 'booking-1',
    occurredAt: new Date().toISOString(),
    payload: { bookingId: 'booking-1', tenantId: 'tenant-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => Promise<unknown>) => cb({}));
    consumerInbox.tryClaim.mockResolvedValue(true);
    consumerInbox.recordProcessed.mockResolvedValue(undefined);
    invoiceService.createInvoice.mockResolvedValue({ id: 'inv-1' });
    flagsService.isEnabled.mockReturnValue(true);

    consumer = new OutboxInvoiceGenerationConsumer(
      dataSource as never,
      consumerInbox as never,
      invoiceService as never,
      flagsService as never,
    );
  });

  it('creates invoice and records inbox on success', async () => {
    await consumer.process(envelope);

    expect(invoiceService.createInvoice).toHaveBeenCalledWith('booking-1');
    expect(consumerInbox.recordProcessed).toHaveBeenCalledWith(CONSUMER_NAME, 'evt-1', expect.anything());
  });

  it('skips duplicate events', async () => {
    consumerInbox.tryClaim.mockResolvedValue(false);

    await consumer.process(envelope);

    expect(invoiceService.createInvoice).not.toHaveBeenCalled();
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('rethrows when createInvoice fails so BullMQ can retry', async () => {
    invoiceService.createInvoice.mockRejectedValue(new Error('numbering failed'));

    await expect(consumer.process(envelope)).rejects.toThrow('numbering failed');
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('ignores non-invoice event types', async () => {
    await consumer.process({ ...envelope, eventType: 'PaymentRecordedEvent' });

    expect(invoiceService.createInvoice).not.toHaveBeenCalled();
  });
});
