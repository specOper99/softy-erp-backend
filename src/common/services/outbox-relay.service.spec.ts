import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../entities/outbox-event.entity';
import {
  DURABLE_FINANCIAL_EVENTS_FLAG,
  DURABLE_MAIL_EVENTS_FLAG,
  OUTBOX_EVENTS_QUEUE,
} from '../events/outbox-envelope';
import { FlagsService } from '../flags/flags.service';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let service: OutboxRelayService;

  const pendingEvent = {
    id: 'evt-1',
    type: 'PaymentRecordedEvent',
    aggregateId: 'b-1',
    payload: { tenantId: 't-1' },
    status: OutboxStatus.PENDING,
    retryCount: 0,
    createdAt: new Date(),
  } as unknown as OutboxEvent;

  const mockOutboxRepository = {
    save: jest.fn().mockImplementation(async (event: OutboxEvent) => event),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([pendingEvent]),
  };

  const mockTransactionalOutboxRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    save: jest.fn().mockImplementation(async (events: OutboxEvent[]) => events),
  };

  const mockDataSource = {
    transaction: jest
      .fn()
      .mockImplementation(
        async (
          callback: (manager: { getRepository: () => typeof mockTransactionalOutboxRepository }) => Promise<unknown>,
        ) => callback({ getRepository: () => mockTransactionalOutboxRepository }),
      ),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockFlagsService = {
    isEnabled: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: getRepositoryToken(OutboxEvent), useValue: mockOutboxRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: getQueueToken(OUTBOX_EVENTS_QUEUE), useValue: mockQueue },
        { provide: FlagsService, useValue: mockFlagsService },
      ],
    }).compile();

    service = module.get(OutboxRelayService);
    jest.clearAllMocks();
    mockFlagsService.isEnabled.mockReturnValue(true);
    mockQueryBuilder.getMany.mockResolvedValue([{ ...pendingEvent }]);
    mockTransactionalOutboxRepository.save.mockImplementation(async (events: OutboxEvent[]) => events);
  });

  it('dispatches events to BullMQ with jobId=eventId', async () => {
    await service.processOutbox();

    expect(mockQueue.add).toHaveBeenCalledWith(
      'PaymentRecordedEvent',
      expect.objectContaining({ eventId: 'evt-1' }),
      expect.objectContaining({ jobId: 'evt-1' }),
    );
    expect(mockOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OutboxStatus.DISPATCHED }),
    );
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mockQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('marks FAILED when all durable kill switches are off (no dual-delivery backlog)', async () => {
    mockFlagsService.isEnabled.mockImplementation((flag: string) => {
      if (flag === DURABLE_FINANCIAL_EVENTS_FLAG || flag === DURABLE_MAIL_EVENTS_FLAG) {
        return false;
      }
      return true;
    });

    await service.processOutbox();

    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OutboxStatus.FAILED,
        error: 'skipped: durable kill switch off',
      }),
    );
  });

  it('still relays when at least one category kill switch remains on (ON→partial OFF)', async () => {
    // PaymentRecorded is financial + mail. Financial OFF, mail ON → leave PENDING path and dispatch.
    mockFlagsService.isEnabled.mockImplementation((flag: string) => {
      if (flag === DURABLE_FINANCIAL_EVENTS_FLAG) return false;
      if (flag === DURABLE_MAIL_EVENTS_FLAG) return true;
      return true;
    });

    await service.processOutbox();

    expect(mockQueue.add).toHaveBeenCalled();
    expect(mockOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OutboxStatus.DISPATCHED }),
    );
  });

  it('ON→OFF before dispatch marks FAILED with kill-switch reason (recoverable via replay)', async () => {
    mockFlagsService.isEnabled.mockReturnValue(false);

    await service.processOutbox();

    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OutboxStatus.FAILED,
        error: 'skipped: durable kill switch off',
      }),
    );
  });

  it('skips when queue is not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: getRepositoryToken(OutboxEvent), useValue: mockOutboxRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    const noQueueService = module.get(OutboxRelayService);

    await noQueueService.processOutbox();

    expect(mockQueryBuilder.getMany).not.toHaveBeenCalled();
  });
});
