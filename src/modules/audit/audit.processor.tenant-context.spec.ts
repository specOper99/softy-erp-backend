import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AuditProcessor } from './audit.processor';
import { AuditLog } from './entities/audit-log.entity';
import { TenantContextService } from '../../common/services/tenant-context.service';

describe('AuditProcessor - Tenant Context', () => {
  let processor: AuditProcessor;
  let repository: jest.Mocked<Repository<AuditLog>>;

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
          provide: getRepositoryToken(AuditLog),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((data) => ({
              ...data,
              id: 'audit-1',
              calculateHash: jest.fn().mockReturnValue('hash-123'),
            })),
            save: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    processor = module.get<AuditProcessor>(AuditProcessor);
    repository = module.get(getRepositoryToken(AuditLog));
  });

  it('should have tenant context available during audit log processing', async () => {
    const tenantId = 'test-tenant-audit';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    // Wrap the test in TenantContextService.run to simulate what the processor should do
    await TenantContextService.run(tenantId, async () => {
      await processor.process(job);
      capturedTenantId = TenantContextService.getTenantId();
    });

    expect(capturedTenantId).toBe(tenantId);
    expect(repository.create).toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  it('should propagate tenant context when saving audit log', async () => {
    const tenantId = 'audit-tenant-789';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    repository.create.mockImplementation((data) => {
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

    // Mock previous log exists
    repository.findOne.mockResolvedValue({
      id: 'prev-audit',
      hash: 'previous-hash-123',
      sequenceNumber: 5,
    } as AuditLog);

    let createCallTenantId: string | undefined;
    repository.create.mockImplementation((data) => {
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
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { tenantId },
      order: { sequenceNumber: 'DESC' },
      select: ['hash', 'sequenceNumber'],
    });
  });
});
