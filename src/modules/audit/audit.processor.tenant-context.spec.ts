import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { AuditProcessor } from './audit.processor';
import { TenantContextService } from '../../common/services/tenant-context.service';

describe('AuditProcessor - Tenant Context', () => {
  let processor: AuditProcessor;

  const mockRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      id: 'audit-1',
      calculateHash: jest.fn().mockReturnValue('hash-123'),
    })),
    save: jest.fn().mockResolvedValue({}),
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

  const createMockJob = (tenantId: string): Job => {
    return {
      name: 'log',
      data: {
        action: 'TEST_ACTION',
        tenantId,
        entityId: 'entity-123',
        entityType: 'Booking',
        oldValues: { status: 'pending' },
        newValues: { status: 'confirmed' },
        userId: 'user-456',
        metadata: { source: 'test' },
      },
    } as unknown as Job;
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
    mockManager.query.mockResolvedValue(undefined);
    mockManager.getRepository.mockReturnValue(mockRepository);
    mockRepository.findOne.mockResolvedValue(null);
    mockRepository.create.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      id: 'audit-1',
      calculateHash: jest.fn().mockReturnValue('hash-123'),
    }));
    mockRepository.save.mockResolvedValue({});
    mockDataSource.transaction.mockImplementation(async (cb: (manager: typeof mockManager) => Promise<void>) => {
      await cb(mockManager);
    });
  });

  it('should have tenant context available during audit log processing', async () => {
    const tenantId = 'test-tenant-audit';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    await TenantContextService.run(tenantId, async () => {
      await processor.process(job);
      capturedTenantId = TenantContextService.getTenantId();
    });

    expect(capturedTenantId).toBe(tenantId);
    expect(mockRepository.create).toHaveBeenCalled();
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should propagate tenant context when saving audit log', async () => {
    const tenantId = 'audit-tenant-789';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    mockRepository.create.mockImplementation((data: Record<string, unknown>) => {
      capturedTenantId = TenantContextService.getTenantId();
      return {
        ...data,
        id: 'audit-2',
        calculateHash: jest.fn().mockReturnValue('hash-456'),
      };
    });

    await TenantContextService.run(tenantId, async () => {
      await processor.process(job);
    });

    expect(capturedTenantId).toBe(tenantId);
  });

  it('should handle audit log with hash chaining in tenant context', async () => {
    const tenantId = 'chain-tenant';
    const job = createMockJob(tenantId);

    mockRepository.findOne.mockResolvedValue({
      id: 'prev-audit',
      hash: 'previous-hash-123',
      sequenceNumber: 5,
    });

    let createCallTenantId: string | undefined;
    mockRepository.create.mockImplementation((data: Record<string, unknown>) => {
      createCallTenantId = TenantContextService.getTenantId();
      return {
        ...data,
        id: 'audit-3',
        calculateHash: jest.fn().mockReturnValue('new-hash'),
      };
    });

    await TenantContextService.run(tenantId, async () => {
      await processor.process(job);
    });

    expect(createCallTenantId).toBe(tenantId);
    expect(mockRepository.findOne).toHaveBeenCalledWith({
      where: { tenantId },
      order: { sequenceNumber: 'DESC' },
      select: ['hash', 'sequenceNumber'],
    });
  });
});
