import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditProcessor } from './audit.processor';

describe('AuditProcessor - Tenant Context', () => {
  let processor: AuditProcessor;

  const mockManager = {
    query: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((entity: unknown, data: Record<string, unknown>) => ({
      ...data,
      id: 'audit-1',
      calculateHash: jest.fn().mockReturnValue('hash-123'),
    })),
    save: jest.fn().mockResolvedValue({}),
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
    mockManager.findOne.mockResolvedValue(null);
    mockManager.create.mockImplementation((entity: unknown, data: Record<string, unknown>) => ({
      ...data,
      id: 'audit-1',
      calculateHash: jest.fn().mockReturnValue('hash-123'),
    }));
    mockManager.save.mockResolvedValue({});
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
    expect(mockManager.create).toHaveBeenCalled();
    expect(mockManager.save).toHaveBeenCalled();
  });

  it('should propagate tenant context when saving audit log', async () => {
    const tenantId = 'audit-tenant-789';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    mockManager.create.mockImplementation((entity: unknown, data: Record<string, unknown>) => {
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

    mockManager.findOne.mockResolvedValue({
      id: 'prev-audit',
      hash: 'previous-hash-123',
      sequenceNumber: 5,
    });

    let createCallTenantId: string | undefined;
    mockManager.create.mockImplementation((entity: unknown, data: Record<string, unknown>) => {
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
    expect(mockManager.findOne).toHaveBeenCalledWith(expect.anything(), {
      where: { tenantId },
      order: { sequenceNumber: 'DESC' },
      select: ['hash', 'sequenceNumber'],
    });
  });
});
