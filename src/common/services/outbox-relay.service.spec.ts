import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../entities/outbox-event.entity';
import { DistributedLockService } from './distributed-lock.service';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let service: OutboxRelayService;

  const pendingEvent = {
    id: 'evt-1',
    type: 'booking.created',
    payload: { id: 'b-1' },
    status: OutboxStatus.PENDING,
    retryCount: 0,
    createdAt: new Date(),
  } as unknown as OutboxEvent;

  const mockOutboxRepository = {
    save: jest.fn().mockImplementation(async (event: OutboxEvent) => event),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([pendingEvent]),
  };

  const mockDataSource = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockDistributedLockService = {
    acquire: jest.fn().mockResolvedValue({ acquired: true, lockToken: 'token-1' }),
    release: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: getRepositoryToken(OutboxEvent), useValue: mockOutboxRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DistributedLockService, useValue: mockDistributedLockService },
      ],
    }).compile();

    service = module.get(OutboxRelayService);
    jest.clearAllMocks();
    mockQueryBuilder.getMany.mockResolvedValue([pendingEvent]);
    mockDistributedLockService.acquire.mockResolvedValue({ acquired: true, lockToken: 'token-1' });
  });

  it('marks events FAILED when broker is not configured', async () => {
    await service.processOutbox();

    expect(mockOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt-1',
        status: OutboxStatus.PENDING,
        retryCount: 1,
        error: expect.stringContaining('No message broker configured'),
      }),
    );
  });

  it('skips processing when lock is not acquired', async () => {
    mockDistributedLockService.acquire.mockResolvedValue({ acquired: false, lockToken: null });

    await service.processOutbox();

    expect(mockQueryBuilder.getMany).not.toHaveBeenCalled();
    expect(mockOutboxRepository.save).not.toHaveBeenCalled();
  });

  it('marks events FAILED after max retries', async () => {
    const exhaustedEvent = {
      ...pendingEvent,
      retryCount: 4,
    } as unknown as OutboxEvent;
    mockQueryBuilder.getMany.mockResolvedValue([exhaustedEvent]);

    await service.processOutbox();

    expect(mockOutboxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt-1',
        status: OutboxStatus.FAILED,
        retryCount: 5,
      }),
    );
  });
});
