import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommonModule } from '../src/common/common.module';
import { OutboxEvent, OutboxStatus } from '../src/common/entities/outbox-event.entity';
import { OutboxRelayService } from '../src/common/services/outbox-relay.service';
import { databaseConfig } from '../src/config';

describe('Transactional Outbox Integration', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let outboxRepository: Repository<OutboxEvent>;
  let relayService: OutboxRelayService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [databaseConfig],
          isGlobal: true,
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get<string>('database.host'),
            port: configService.get<number>('database.port'),
            username: configService.get<string>('database.username'),
            password: configService.get<string>('database.password'),
            database: configService.get<string>('database.database'),
            entities: [OutboxEvent],
            synchronize: true, // Use generic true for test env
            dropSchema: true,
          }),
        }),
        CommonModule,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(DataSource);
    outboxRepository = dataSource.getRepository(OutboxEvent);
    relayService = moduleRef.get<OutboxRelayService>(OutboxRelayService);

    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should save OutboxEvent within a transaction', async () => {
    const aggregateId = 'user-123';

    await dataSource.transaction(async (manager) => {
      // Simulate saving a user (not actually needing User entity here)
      const event = manager.create(OutboxEvent, {
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
