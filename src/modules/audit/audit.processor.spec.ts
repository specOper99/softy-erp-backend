import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AuditProcessor } from './audit.processor';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditProcessor', () => {
  let processor: AuditProcessor;
  let _repository: Repository<AuditLog>;

  const _mockAuditLog = {
    id: 'log-1',
    hash: 'hash-1',
    sequenceNumber: 1,
    calculateHash: jest.fn().mockReturnValue('new-hash'),
  } as unknown as AuditLog;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditProcessor,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    processor = module.get<AuditProcessor>(AuditProcessor);
    _repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should handle log job', async () => {
      const job = {
        name: 'log',
        data: {
          action: 'TEST',
          tenantId: 't1',
          entityId: 'e1',
        },
      } as Job;

      const processSpy = jest.spyOn(processor as any, 'handleLog').mockResolvedValue(undefined);

      await processor.process(job);

      expect(processSpy).toHaveBeenCalledWith(job.data);
    });

    it('should ignore other jobs', async () => {
      const job = { name: 'unknown', data: {} } as Job;
      await processor.process(job);
      // handleLog not called - relying on impl detail or side effects,
      // but here verifying no error thrown.
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
      // We removed sanitize from processor, so it expects raw values
      mockRepository.create.mockReturnValue(mockEntry);

      await (processor as any).handleLog(logData);

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

      await (processor as any).handleLog(logData);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousHash: undefined,
          sequenceNumber: 1,
        }),
      );
    });

    it('should rethrow errors', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('DB Error'));
      await expect((processor as any).handleLog(logData)).rejects.toThrow('DB Error');
    });
  });
});
