import { OutboxWebhookConsumer, CONSUMER_NAME } from './outbox-webhook.consumer';
import type { OutboxEventEnvelope } from '../../../common/events/outbox-envelope';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { TenantContextService } from '../../../common/services/tenant-context.service';

describe('OutboxWebhookConsumer', () => {
  const envelope: OutboxEventEnvelope = {
    eventId: 'evt-webhook-1',
    eventType: 'BookingCreatedEvent',
    eventVersion: 1,
    tenantId: 'tenant-1',
    aggregateType: 'booking',
    aggregateId: 'booking-1',
    occurredAt: '2030-01-01T10:00:00.000Z',
    payload: { bookingId: 'booking-1', clientName: 'Ada' },
    correlationId: null,
  };

  let consumer: OutboxWebhookConsumer;
  let consumerInbox: { tryClaim: jest.Mock; recordProcessed: jest.Mock };
  let webhookService: { emit: jest.Mock };
  let flagsService: { isEnabled: jest.Mock };
  let manager: Record<string, never>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    manager = {};
    consumerInbox = {
      tryClaim: jest.fn().mockResolvedValue(true),
      recordProcessed: jest.fn().mockResolvedValue(undefined),
    };
    webhookService = {
      emit: jest.fn().mockResolvedValue(undefined),
    };
    flagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) => cb(manager)),
    };

    consumer = new OutboxWebhookConsumer(
      dataSource as never,
      consumerInbox as never,
      webhookService as never,
      flagsService as never,
    );

    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, cb) => cb());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits webhook and records inbox on first delivery', async () => {
    await consumer.process(envelope);

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true);
    expect(consumerInbox.tryClaim).toHaveBeenCalledWith(CONSUMER_NAME, envelope.eventId, manager);
    expect(webhookService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'booking.created',
        tenantId: 'tenant-1',
        payload: expect.objectContaining({
          bookingId: 'booking-1',
          aggregateId: 'booking-1',
          eventId: 'evt-webhook-1',
        }),
        timestamp: envelope.occurredAt,
      }),
      { throwOnFailure: true },
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalledWith(CONSUMER_NAME, envelope.eventId, manager);
  });

  it('skips emit on inbox dedupe (duplicate eventId)', async () => {
    consumerInbox.tryClaim.mockResolvedValue(false);

    await consumer.process(envelope);

    expect(webhookService.emit).not.toHaveBeenCalled();
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('throws on emit failure so BullMQ can retry (inbox not recorded)', async () => {
    const failure = new Error('webhook delivery failed');
    webhookService.emit.mockRejectedValue(failure);

    await expect(consumer.process(envelope)).rejects.toThrow('webhook delivery failed');
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('no-ops when durable webhook kill switch is off', async () => {
    flagsService.isEnabled.mockReturnValue(false);

    await consumer.process(envelope);

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
    expect(webhookService.emit).not.toHaveBeenCalled();
  });

  it('throws when tenantId is missing', async () => {
    await expect(consumer.process({ ...envelope, tenantId: null })).rejects.toThrow(/missing tenantId/);
  });

  it('ignores non-webhook event types', async () => {
    await consumer.process({ ...envelope, eventType: 'PaymentRecordedEvent' });

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
    expect(webhookService.emit).not.toHaveBeenCalled();
  });
});
