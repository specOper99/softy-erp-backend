import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DeepPartial } from 'typeorm';
import { AuditProcessor } from './audit.processor';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditProcessor', () => {
  let processor: AuditProcessor;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn().mockResolvedValue(undefined),
  };

  const mockManager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn().mockReturnValue(mockRepository),
  };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb: (manager: typeof mockManager) => Promise<void>) => {
      await cb(mockManager);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditProcessor,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    processor = module.get<AuditProcessor>(AuditProcessor);
    jest.clearAllMocks();
    // Re-setup defaults after clearAllMocks
    mockManager.query.mockResolvedValue(undefined);
    mockManager.getRepository.mockReturnValue(mockRepository);
    mockDataSource.transaction.mockImplementation(async (cb: (manager: typeof mockManager) => Promise<void>) => {
      await cb(mockManager);
    });
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should handle log job', async () => {
      const discard = jest.fn();
      const job = {
        name: 'log',
        data: {
          action: 'TEST',
          tenantId: 't1',
          entityId: 'e1',
        },
        discard,
      } as unknown as Job;

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({ calculateHash: () => 'hash' } as DeepPartial<AuditLog> as AuditLog);
      mockRepository.save.mockResolvedValue({});

      await processor.process(job);

      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should ignore other jobs', async () => {
      const job = { name: 'unknown', data: {} } as Job;
      await processor.process(job);
    });

    it('should discard and fail when tenantId is missing', async () => {
      const discard = jest.fn();
      const job = {
        name: 'log',
        data: {
          action: 'TEST',
          entityId: 'e1',
        },
        discard,
      } as unknown as Job;

      await expect(processor.process(job)).rejects.toThrow('Invalid audit job payload: tenantId is required');
      expect(discard).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleLog', () => {
    const logData = {
      tenantId: 'tenant-1',
      action: 'UPDATE',
      entityId: 'e1',
      oldValues: { val: 1 },
      newValues: { val: 2 },
    };

    it('should chain hash correctly with previous log', async () => {
      mockRepository.findOne.mockResolvedValue({
        hash: 'prev-hash',
        sequenceNumber: 10,
      });

      const mockEntry = {
        ...logData,
        calculateHash: jest.fn().mockReturnValue('new-hash'),
      };
      mockRepository.create.mockReturnValue(mockEntry);
      mockRepository.save.mockResolvedValue({});

      await processor.process({ name: 'log', data: logData, discard: jest.fn() } as unknown as Job);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        order: { sequenceNumber: 'DESC' },
        select: ['hash', 'sequenceNumber'],
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          previousHash: 'prev-hash',
          sequenceNumber: 11,
        }),
      );

      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should handle first log (no previous)', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const mockEntry = {
        ...logData,
        calculateHash: jest.fn().mockReturnValue('first-hash'),
      };
      mockRepository.create.mockReturnValue(mockEntry);
      mockRepository.save.mockResolvedValue({});

      await processor.process({ name: 'log', data: logData, discard: jest.fn() } as unknown as Job);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousHash: undefined,
          sequenceNumber: 1,
        }),
      );
    });

    it('should rethrow errors', async () => {
      mockDataSource.transaction.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        processor.process({ name: 'log', data: logData, discard: jest.fn() } as unknown as Job),
      ).rejects.toThrow('DB Error');
    });
  });
});
