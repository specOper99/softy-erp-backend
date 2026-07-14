import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { DataSource, Repository } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../../src/common/entities/outbox-event.entity';
import { ConsumerInbox } from '../../src/common/entities/consumer-inbox.entity';
import { OutboxRelayService } from '../../src/common/services/outbox-relay.service';

describe('Outbox relay integration', () => {
  let dataSource: DataSource;
  let outboxRepository: Repository<OutboxEvent>;
  let inboxRepository: Repository<ConsumerInbox>;
  let relayService: OutboxRelayService;

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeAll(async () => {
    dataSource = globalThis.__DATA_SOURCE__!;
    if (!dataSource?.isInitialized) {
      throw new Error('DataSource not initialized');
    }

    outboxRepository = dataSource.getRepository(OutboxEvent);
    inboxRepository = dataSource.getRepository(ConsumerInbox);
    relayService = new OutboxRelayService(outboxRepository, dataSource, mockQueue as never, undefined);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await inboxRepository.delete({});
      await outboxRepository.delete({});
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    if (dataSource?.isInitialized) {
      await inboxRepository.delete({});
      await outboxRepository.delete({});
    }
  });

  it('dispatches pending event and marks DISPATCHED after enqueue succeeds', async () => {
    const event = await outboxRepository.save(
      outboxRepository.create({
        aggregateId: 'booking-crash-after',
        aggregateType: 'Booking',
        type: 'PaymentRecordedEvent',
        tenantId: 'tenant-a',
        payload: { tenantId: 'tenant-a', amount: 100 },
        status: OutboxStatus.PENDING,
      }),
    );

    await relayService.processOutbox();

    expect(mockQueue.add).toHaveBeenCalledWith(
      'PaymentRecordedEvent',
      expect.objectContaining({ eventId: event.id }),
      expect.objectContaining({ jobId: event.id }),
    );

    const updated = await outboxRepository.findOneByOrFail({ id: event.id });
    expect(updated.status).toBe(OutboxStatus.DISPATCHED);
    expect(updated.dispatchedAt).toBeTruthy();
  });

  it('keeps event PENDING when enqueue fails (crash-before-enqueue recovery)', async () => {
    mockQueue.add.mockRejectedValueOnce(new Error('redis unavailable'));

    const event = await outboxRepository.save(
      outboxRepository.create({
        aggregateId: 'booking-crash-before',
        aggregateType: 'Booking',
        type: 'BookingCreatedEvent',
        tenantId: 'tenant-a',
        payload: { tenantId: 'tenant-a', bookingId: 'b-1' },
        status: OutboxStatus.PENDING,
        retryCount: 0,
      }),
    );

    await relayService.processOutbox();

    const updated = await outboxRepository.findOneByOrFail({ id: event.id });
    expect(updated.status).toBe(OutboxStatus.PENDING);
    expect(updated.retryCount).toBe(1);
    expect(updated.nextAttemptAt).toBeTruthy();
    expect(updated.dispatchedAt).toBeNull();
  });

  it('allows duplicate relay without losing row (at-least-once enqueue)', async () => {
    const event = await outboxRepository.save(
      outboxRepository.create({
        aggregateId: 'booking-dup',
        aggregateType: 'Booking',
        type: 'PaymentRecordedEvent',
        tenantId: 'tenant-a',
        payload: { tenantId: 'tenant-a' },
        status: OutboxStatus.PENDING,
      }),
    );

    await relayService.processOutbox();
    await outboxRepository.update(event.id, { status: OutboxStatus.PENDING, dispatchedAt: null });
    await relayService.processOutbox();

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    const rows = await outboxRepository.find({ where: { id: event.id } });
    expect(rows).toHaveLength(1);
  });

  it('deduplicates consumer inbox on replay', async () => {
    const eventId = '00000000-0000-4000-8000-000000000099';
    await inboxRepository.save({ consumerName: 'outbox-financial-router', eventId });

    const before = await inboxRepository.count();
    expect(before).toBe(1);

    await expect(inboxRepository.save({ consumerName: 'outbox-financial-router', eventId })).rejects.toThrow();

    const after = await inboxRepository.count();
    expect(after).toBe(1);
  });
});
