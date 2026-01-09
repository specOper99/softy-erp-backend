import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;

  const mockAuditLog = {
    id: 'log-123',
    action: 'CREATE',
    entityName: 'User',
    entityId: 'user-123',
    createdAt: new Date(),
  } as AuditLog;

  const mockRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((dto) => ({
      ...dto,
      calculateHash: jest.fn().mockReturnValue('hash-1'),
      verifyHash: jest.fn().mockReturnValue(true),
    })),
    save: jest.fn().mockResolvedValue(mockAuditLog),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
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
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue(testTenantId);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log using the injected repository when no manager provided', async () => {
      const result = await service.log(logData);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...logData,
          tenantId: testTenantId,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockAuditLog);
    });

    it('should log using the manager repository when manager provided', async () => {
      const mockManagerRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((dto) => ({
          ...dto,
          calculateHash: jest.fn().mockReturnValue('hash-2'),
          verifyHash: jest.fn().mockReturnValue(true),
        })),
        save: jest.fn().mockResolvedValue(mockAuditLog),
      };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      } as unknown as EntityManager;

      const result = await service.log(logData, mockManager);

      expect(mockManager.getRepository).toHaveBeenCalledWith(AuditLog);
      expect(mockManagerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...logData,
          tenantId: testTenantId,
        }),
      );
      expect(mockManagerRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockAuditLog);
    });

    it('should sanitize PII in oldValues and newValues', async () => {
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

      expect(repository.create).toHaveBeenCalledWith(
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
  });
});
