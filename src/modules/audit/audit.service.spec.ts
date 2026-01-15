import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createMockQueue, createMockRepository } from '../../../test/helpers/mock-factories';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let auditQueue: ReturnType<typeof createMockQueue>;

  const mockRepository = createMockRepository<AuditLog>();

  const mockQueue = createMockQueue();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
        {
          provide: getQueueToken('audit-queue'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    auditQueue = module.get(getQueueToken('audit-queue'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    const logData = {
      action: 'CREATE',
      entityName: 'User',
      entityId: 'user-123',
      notes: 'Test log',
    };
    const testTenantId = 'tenant-123';

    beforeEach(() => {
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(testTenantId);
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should enqueue log job to audit queue', async () => {
      await service.log(logData);

      expect(auditQueue.add).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          ...logData,
          tenantId: testTenantId,
        }),
      );
    });

    it('should sanitize PII before enqueueing', async () => {
      const sensitiveData = {
        action: 'UPDATE',
        entityName: 'Client',
        entityId: 'client-1',
        oldValues: { email: 'test@example.com', phone: '1234567890' },
        newValues: {
          email: 'new@example.com',
          password: 'plain',
          nested: { ssn: '1234' },
        },
      };

      await service.log(sensitiveData);

      expect(auditQueue.add).toHaveBeenCalledWith(
        'log',
        expect.objectContaining({
          oldValues: { email: '***MASKED***', phone: '***MASKED***' },
          newValues: {
            email: '***MASKED***',
            password: '***MASKED***',
            nested: { ssn: '***MASKED***' },
          },
        }),
      );
    });

    it('should handle queue errors gracefully', async () => {
      auditQueue.add.mockRejectedValue(new Error('Queue Error'));
      // Should not throw
      await expect(service.log(logData)).resolves.not.toThrow();
    });
  });
});
