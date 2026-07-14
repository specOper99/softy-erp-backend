import { OutboxFinancialConsumer, CONSUMER_NAME } from './outbox-financial.consumer';
import type { OutboxEventEnvelope } from '../../../common/events/outbox-envelope';
import { DURABLE_FINANCIAL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { TenantContextService } from '../../../common/services/tenant-context.service';

describe('OutboxFinancialConsumer', () => {
  const paymentEnvelope: OutboxEventEnvelope = {
    eventId: 'evt-fin-1',
    eventType: 'PaymentRecordedEvent',
    eventVersion: 1,
    tenantId: 'tenant-1',
    aggregateType: 'booking',
    aggregateId: 'booking-1',
    occurredAt: '2030-01-01T10:00:00.000Z',
    payload: {
      bookingId: 'booking-1',
      amount: 250,
      tenantId: 'tenant-1',
    },
    correlationId: null,
  };

  let consumer: OutboxFinancialConsumer;
  let consumerInbox: { tryClaim: jest.Mock; recordProcessed: jest.Mock };
  let metricsRepository: { insert: jest.Mock; increment: jest.Mock };
  let flagsService: { isEnabled: jest.Mock };
  let manager: Record<string, never>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    manager = {};
    consumerInbox = {
      tryClaim: jest.fn().mockResolvedValue(true),
      recordProcessed: jest.fn().mockResolvedValue(undefined),
    };
    metricsRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    flagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) => cb(manager)),
    };

    consumer = new OutboxFinancialConsumer(
      dataSource as never,
      consumerInbox as never,
      metricsRepository as never,
      flagsService as never,
    );

    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, cb) => cb());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('applies payment revenue and records inbox on first delivery', async () => {
    await consumer.process(paymentEnvelope);

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_FINANCIAL_EVENTS_FLAG, {}, true);
    expect(consumerInbox.tryClaim).toHaveBeenCalledWith(CONSUMER_NAME, paymentEnvelope.eventId, manager);
    expect(metricsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        date: '2030-01-01',
        totalRevenue: 250,
      }),
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalledWith(CONSUMER_NAME, paymentEnvelope.eventId, manager);
  });

  it('applies refund as negative revenue', async () => {
    await consumer.process({
      ...paymentEnvelope,
      eventId: 'evt-fin-refund',
      eventType: 'RefundRecordedEvent',
      payload: { amount: 100 },
    });

    expect(metricsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        totalRevenue: -100,
      }),
    );
  });

  it('skips metrics on inbox dedupe', async () => {
    consumerInbox.tryClaim.mockResolvedValue(false);

    await consumer.process(paymentEnvelope);

    expect(metricsRepository.insert).not.toHaveBeenCalled();
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('no-ops when durable financial kill switch is off', async () => {
    flagsService.isEnabled.mockReturnValue(false);

    await consumer.process(paymentEnvelope);

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
    expect(metricsRepository.insert).not.toHaveBeenCalled();
  });

  it('throws when tenantId is missing', async () => {
    await expect(consumer.process({ ...paymentEnvelope, tenantId: null })).rejects.toThrow(/missing tenantId/);
  });

  it('ignores non-financial event types', async () => {
    await consumer.process({ ...paymentEnvelope, eventType: 'BookingConfirmedEvent' });

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
  });
});
