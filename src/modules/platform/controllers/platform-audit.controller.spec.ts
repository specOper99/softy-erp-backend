import { Test, TestingModule } from '@nestjs/testing';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from '../services/platform-audit.service';
import { PlatformAuditController } from './platform-audit.controller';

describe('PlatformAuditController', () => {
  let controller: PlatformAuditController;
  let auditService: PlatformAuditService;

  const mockAuditLogs = {
    logs: [
      {
        id: 'log-1',
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        targetTenantId: 'tenant-456',
        ipAddress: '192.168.1.1',
        performedAt: new Date('2025-01-15'),
      },
      {
        id: 'log-2',
        platformUserId: 'user-789',
        action: PlatformAction.TENANT_CREATED,
        targetTenantId: 'tenant-999',
        ipAddress: '10.0.0.1',
        performedAt: new Date('2025-01-14'),
      },
    ],
    total: 2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformAuditController],
      providers: [
        {
          provide: PlatformAuditService,
          useValue: {
            findAll: jest.fn().mockResolvedValue(mockAuditLogs),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformAuditController>(PlatformAuditController);
    auditService = module.get<PlatformAuditService>(PlatformAuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with no filters', async () => {
      const result = await controller.getAuditLogs(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(auditService.findAll).toHaveBeenCalledWith({
        platformUserId: undefined,
        action: undefined,
        targetTenantId: undefined,
        startDate: undefined,
        endDate: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result.logs).toEqual(mockAuditLogs.logs);
      expect(result.total).toBe(2);
    });

    it('should filter by platform user id', async () => {
      await controller.getAuditLogs('user-123', undefined, undefined, undefined, undefined, undefined, undefined);

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          platformUserId: 'user-123',
        }),
      );
    });

    it('should filter by action', async () => {
      await controller.getAuditLogs(
        undefined,
        PlatformAction.TENANT_SUSPENDED,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.TENANT_SUSPENDED,
        }),
      );
    });

    it('should filter by tenant id', async () => {
      await controller.getAuditLogs(undefined, undefined, 'tenant-456', undefined, undefined, undefined, undefined);

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTenantId: 'tenant-456',
        }),
      );
    });

    it('should filter by date range', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      await controller.getAuditLogs(undefined, undefined, undefined, startDate, endDate, undefined, undefined);

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-31'),
        }),
      );
    });

    it('should respect custom pagination', async () => {
      await controller.getAuditLogs(undefined, undefined, undefined, undefined, undefined, '100', '50');

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          offset: 50,
        }),
      );
    });

    it('should apply multiple filters together', async () => {
      await controller.getAuditLogs(
        'user-123',
        PlatformAction.TENANT_SUSPENDED,
        'tenant-456',
        '2025-01-10',
        '2025-01-20',
        '25',
        '5',
      );

      expect(auditService.findAll).toHaveBeenCalledWith({
        platformUserId: 'user-123',
        action: PlatformAction.TENANT_SUSPENDED,
        targetTenantId: 'tenant-456',
        startDate: new Date('2025-01-10'),
        endDate: new Date('2025-01-20'),
        limit: 25,
        offset: 5,
      });
    });

    it('should parse string pagination values to integers', async () => {
      await controller.getAuditLogs(undefined, undefined, undefined, undefined, undefined, '200', '100');

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 200,
          offset: 100,
        }),
      );
    });

    it('should convert date strings to Date objects', async () => {
      const startDate = '2025-01-15';

      await controller.getAuditLogs(undefined, undefined, undefined, startDate, undefined, undefined, undefined);

      expect(auditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
        }),
      );
    });
  });
});
