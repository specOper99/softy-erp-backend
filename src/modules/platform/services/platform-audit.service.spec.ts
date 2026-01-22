import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createMockQueryBuilder } from '../../../../test/helpers/test-setup.utils';
import { PlatformAuditLog } from '../entities/platform-audit-log.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';

describe('PlatformAuditService', () => {
  let service: PlatformAuditService;
  let auditLogRepository: Repository<PlatformAuditLog>;

  const mockAuditLog = {
    id: 'log-123',
    platformUserId: 'user-123',
    action: PlatformAction.TENANT_SUSPENDED,
    targetTenantId: 'tenant-456',
    ipAddress: '192.168.1.1',
    performedAt: new Date(),
    success: true,
  };

  // Shared helper to create query builder mock with audit-specific methods
  const createAuditQueryBuilder = (logs: unknown[] = [mockAuditLog], total = 1) => {
    const qb = createMockQueryBuilder(logs);
    qb.getCount = jest.fn().mockResolvedValue(total);
    return qb;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAuditService,
        {
          provide: getRepositoryToken(PlatformAuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformAuditService>(PlatformAuditService);
    auditLogRepository = module.get<Repository<PlatformAuditLog>>(getRepositoryToken(PlatformAuditLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create audit log entry', async () => {
      const dto = {
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        ipAddress: '192.168.1.1',
      };

      (auditLogRepository.create as jest.Mock).mockReturnValue(mockAuditLog);
      (auditLogRepository.save as jest.Mock).mockResolvedValue(mockAuditLog);

      const result = await service.log(dto);

      expect(auditLogRepository.create).toHaveBeenCalledWith({
        ...dto,
        success: true,
      });
      expect(auditLogRepository.save).toHaveBeenCalledWith(mockAuditLog);
      expect(result).toEqual(mockAuditLog);
    });

    it('should set success to true by default', async () => {
      const dto = {
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        ipAddress: '192.168.1.1',
      };

      (auditLogRepository.create as jest.Mock).mockReturnValue(mockAuditLog);
      (auditLogRepository.save as jest.Mock).mockResolvedValue(mockAuditLog);

      await service.log(dto);

      expect(auditLogRepository.create).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should respect explicit success value', async () => {
      const dto = {
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        ipAddress: '192.168.1.1',
        success: false,
        errorMessage: 'Tenant not found',
      };

      const failedLog = { ...mockAuditLog, success: false };

      (auditLogRepository.create as jest.Mock).mockReturnValue(failedLog);
      (auditLogRepository.save as jest.Mock).mockResolvedValue(failedLog);

      await service.log(dto);

      expect(auditLogRepository.create).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('should include all optional fields when provided', async () => {
      const dto = {
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        ipAddress: '192.168.1.1',
        targetTenantId: 'tenant-456',
        targetUserId: 'user-789',
        reason: 'Payment overdue',
        userAgent: 'Mozilla/5.0',
        requestId: 'req-123',
        success: true,
      };

      (auditLogRepository.create as jest.Mock).mockReturnValue(mockAuditLog);
      (auditLogRepository.save as jest.Mock).mockResolvedValue(mockAuditLog);

      await service.log(dto);

      expect(auditLogRepository.create).toHaveBeenCalledWith(expect.objectContaining(dto));
    });

    it('should handle save errors', async () => {
      const dto = {
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        ipAddress: '192.168.1.1',
      };

      (auditLogRepository.create as jest.Mock).mockReturnValue(mockAuditLog);
      (auditLogRepository.save as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.log(dto)).rejects.toThrow('Database error');
    });
  });

  describe('findAll', () => {
    it('should query all audit logs with default pagination', async () => {
      const mockLogs = [mockAuditLog];
      const mockQb = createAuditQueryBuilder(mockLogs, 1);

      (auditLogRepository.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

      const result = await service.findAll({});

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(1);
      expect(mockQb.orderBy).toHaveBeenCalledWith('log.performedAt', 'DESC');
      expect(mockQb.limit).toHaveBeenCalledWith(100);
      expect(mockQb.offset).toHaveBeenCalledWith(0);
    });

    it('should filter by platform user id', async () => {
      const mockQb = createAuditQueryBuilder();

      (auditLogRepository.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

      await service.findAll({ platformUserId: 'user-123' });

      expect(mockQb.andWhere).toHaveBeenCalledWith('log.platformUserId = :userId', { userId: 'user-123' });
    });

    it('should filter by action', async () => {
      const mockQb = createAuditQueryBuilder();

      (auditLogRepository.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

      await service.findAll({ action: PlatformAction.TENANT_SUSPENDED });

      expect(mockQb.andWhere).toHaveBeenCalledWith('log.action = :action', { action: PlatformAction.TENANT_SUSPENDED });
    });

    it('should filter by target tenant id', async () => {
      const mockQb = createAuditQueryBuilder();

      (auditLogRepository.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

      await service.findAll({ targetTenantId: 'tenant-456' });

      expect(mockQb.andWhere).toHaveBeenCalledWith('log.targetTenantId = :tenantId', { tenantId: 'tenant-456' });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const mockQb = createAuditQueryBuilder();

      (auditLogRepository.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

      await service.findAll({ startDate, endDate });

      expect(mockQb.andWhere).toHaveBeenCalledWith('log.performedAt >= :startDate', { startDate });
      expect(mockQb.andWhere).toHaveBeenCalledWith('log.performedAt <= :endDate', { endDate });
    });

    it('should respect custom pagination limits', async () => {
      const mockQb = createAuditQueryBuilder([mockAuditLog], 250);

      (auditLogRepository.createQueryBuilder as jest.Mock).mockReturnValue(mockQb);

      await service.findAll({ limit: 50, offset: 100 });

      expect(mockQb.limit).toHaveBeenCalledWith(50);
      expect(mockQb.offset).toHaveBeenCalledWith(100);
    });
  });

  describe('getTenantAuditTrail', () => {
    it('should return audit logs for specific tenant', async () => {
      const mockLogs = [mockAuditLog];

      (auditLogRepository.find as jest.Mock).mockResolvedValue(mockLogs);

      const result = await service.getTenantAuditTrail('tenant-456');

      expect(auditLogRepository.find).toHaveBeenCalledWith({
        where: { targetTenantId: 'tenant-456' },
        relations: ['platformUser'],
        order: { performedAt: 'DESC' },
        take: 100,
      });
      expect(result).toEqual(mockLogs);
    });

    it('should respect custom limit', async () => {
      const mockLogs = [mockAuditLog];

      (auditLogRepository.find as jest.Mock).mockResolvedValue(mockLogs);

      await service.getTenantAuditTrail('tenant-456', 50);

      expect(auditLogRepository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });

    it('should load platformUser relation', async () => {
      (auditLogRepository.find as jest.Mock).mockResolvedValue([]);

      await service.getTenantAuditTrail('tenant-456');

      expect(auditLogRepository.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['platformUser'] }));
    });
  });

  describe('getUserRecentActions', () => {
    it('should return recent actions by platform user', async () => {
      const mockLogs = [mockAuditLog];

      (auditLogRepository.find as jest.Mock).mockResolvedValue(mockLogs);

      const result = await service.getUserRecentActions('user-123');

      expect(auditLogRepository.find).toHaveBeenCalledWith({
        where: { platformUserId: 'user-123' },
        order: { performedAt: 'DESC' },
        take: 50,
      });
      expect(result).toEqual(mockLogs);
    });

    it('should respect custom limit', async () => {
      const mockLogs = [mockAuditLog];

      (auditLogRepository.find as jest.Mock).mockResolvedValue(mockLogs);

      await service.getUserRecentActions('user-123', 25);

      expect(auditLogRepository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
    });

    it('should return empty array for user with no actions', async () => {
      (auditLogRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.getUserRecentActions('non-existent-user');

      expect(result).toEqual([]);
    });
  });
});
