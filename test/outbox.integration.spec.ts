import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource, Repository } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../src/common/entities/outbox-event.entity';
import { OutboxRelayService } from '../src/common/services/outbox-relay.service';

describe('Transactional Outbox Integration', () => {
  let dataSource: DataSource;
  let outboxRepository: Repository<OutboxEvent>;
  let relayService: OutboxRelayService;

  beforeAll(async () => {
    dataSource = globalThis.__DATA_SOURCE__;

    if (!dataSource || !dataSource.isInitialized) {
      throw new Error('DataSource not initialized. Ensure integration setup ran.');
    }

    outboxRepository = dataSource.getRepository('OutboxEvent') as Repository<OutboxEvent>;
    relayService = new OutboxRelayService(outboxRepository);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await outboxRepository.delete({});
    }
  });

  beforeEach(async () => {
    if (dataSource?.isInitialized) {
      await outboxRepository.delete({});
    }
  });

  it('should save OutboxEvent within a transaction', async () => {
    const aggregateId = 'user-123';

    await dataSource.transaction(async (manager) => {
      const event = manager.create('OutboxEvent', {
        aggregateId,
        type: 'UserCreated',
        payload: { email: 'test@example.com' },
      });
      await manager.save(event);
    });

    const savedEvent = await outboxRepository.findOne({
      where: { aggregateId },
    });
    expect(savedEvent).toBeDefined();
    expect(savedEvent?.status).toBe(OutboxStatus.PENDING);
  });

  it('should generic relay service process pending events', async () => {
    // 1. Seed a pending event
    const event = outboxRepository.create({
      aggregateId: 'relay-test-1',
      type: 'TestEvent',
      payload: { foo: 'bar' },
      status: OutboxStatus.PENDING,
    });
    await outboxRepository.save(event);

    // 2. Trigger relay
    await relayService.processOutbox();

    // 3. Verify processed
    const processedEvent = await outboxRepository.findOne({
      where: { id: event.id },
    });
    expect(processedEvent?.status).toBe(OutboxStatus.PUBLISHED);
  });
});
