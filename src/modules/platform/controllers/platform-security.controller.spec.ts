import { Test, TestingModule } from '@nestjs/testing';
import { PlatformSecurityService } from '../services/platform-security.service';
import { PlatformSecurityController } from './platform-security.controller';

interface PlatformSecurityRequest {
  ip?: string;
  connection?: { remoteAddress?: string };
  user: {
    userId: string;
  };
}

describe('PlatformSecurityController', () => {
  let controller: PlatformSecurityController;
  let securityService: PlatformSecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformSecurityController],
      providers: [
        {
          provide: PlatformSecurityService,
          useValue: {
            forcePasswordReset: jest.fn().mockResolvedValue(void 0),
            revokeAllSessions: jest.fn().mockResolvedValue(10),
            updateIpAllowlist: jest.fn().mockResolvedValue(void 0),
            initiateDataExport: jest.fn().mockResolvedValue({ jobId: 'job-123' }),
            initiateDataDeletion: jest.fn().mockResolvedValue({ deletionId: 'del-123' }),
            getSecurityPolicies: jest.fn().mockResolvedValue({
              passwordMinLength: 12,
              mfaRequired: true,
            }),
            updateSecurityPolicies: jest.fn().mockResolvedValue({
              passwordMinLength: 14,
              mfaRequired: true,
            }),
            getTenantRiskScore: jest.fn().mockResolvedValue(45),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformSecurityController>(PlatformSecurityController);
    securityService = module.get<PlatformSecurityService>(PlatformSecurityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('forcePasswordReset', () => {
    it('should force password reset for user', async () => {
      const tenantId = 'tenant-123';
      const userId = 'user-456';
      const dto = { reason: 'Security policy update' };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      await controller.forcePasswordReset(tenantId, userId, dto, mockRequest);

      expect(securityService.forcePasswordReset).toHaveBeenCalledWith(
        { userId, reason: dto.reason },
        'admin-user-123',
        '192.168.1.1',
      );
    });

    it('should use connection.remoteAddress if ip not available', async () => {
      const tenantId = 'tenant-123';
      const userId = 'user-456';
      const dto = { reason: 'Suspected account compromise' };

      const mockRequest = {
        connection: { remoteAddress: '10.0.0.1' },
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      await controller.forcePasswordReset(tenantId, userId, dto, mockRequest);

      expect(securityService.forcePasswordReset).toHaveBeenCalledWith(
        { userId, reason: dto.reason },
        'admin-user-123',
        '10.0.0.1',
      );
    });

    it('should use unknown if ip not available', async () => {
      const tenantId = 'tenant-123';
      const userId = 'user-456';
      const dto = { reason: 'Regular password update' };

      const mockRequest = {
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      await controller.forcePasswordReset(tenantId, userId, dto, mockRequest);

      expect(securityService.forcePasswordReset).toHaveBeenCalledWith(
        { userId, reason: dto.reason },
        'admin-user-123',
        'unknown',
      );
    });
  });

  describe('revokeSessions', () => {
    it('should revoke all sessions in tenant', async () => {
      const tenantId = 'tenant-123';
      const dto = { reason: 'Suspicious activity detected' };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      const result = await controller.revokeSessions(tenantId, dto, mockRequest);

      expect(securityService.revokeAllSessions).toHaveBeenCalledWith(
        { tenantId, reason: dto.reason },
        'admin-user-123',
        '192.168.1.1',
      );
      expect(result).toEqual({ revokedSessions: 10 });
    });

    it('should return count of revoked sessions', async () => {
      (securityService.revokeAllSessions as jest.Mock).mockResolvedValueOnce(25);

      const tenantId = 'tenant-456';
      const dto = { reason: 'Security incident' };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      const result = await controller.revokeSessions(tenantId, dto, mockRequest);

      expect(result.revokedSessions).toBe(25);
    });
  });

  describe('updateIpAllowlist', () => {
    it('should update IP allowlist for tenant', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        ipAddresses: ['192.168.1.0/24', '10.0.0.0/8'],
        reason: 'VPN network configuration change',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      await controller.updateIpAllowlist(tenantId, dto, mockRequest);

      expect(securityService.updateIpAllowlist).toHaveBeenCalledWith(
        { tenantId, allowedIps: dto.ipAddresses, reason: dto.reason },
        'admin-user-123',
        '192.168.1.1',
      );
    });

    it('should handle empty allowlist', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        ipAddresses: [] as string[],
        reason: 'Disable IP restrictions',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      await controller.updateIpAllowlist(tenantId, dto, mockRequest);

      expect(securityService.updateIpAllowlist).toHaveBeenCalledWith(
        { tenantId, allowedIps: [], reason: dto.reason },
        'admin-user-123',
        '192.168.1.1',
      );
    });
  });

  describe('initiateDataExport', () => {
    it('should initiate data export for tenant', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        exportType: 'audit_logs',
        reason: 'Compliance audit request',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      const result = await controller.initiateDataExport(tenantId, dto, mockRequest);

      expect(securityService.initiateDataExport).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          exportType: 'gdpr',
          reason: dto.reason,
        }),
        'admin-user-123',
        '192.168.1.1',
      );
      expect(result).toEqual({ jobId: 'job-123' });
    });

    it('should support data export with any reason', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        exportType: 'full_export',
        reason: 'Legal hold request',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      const result = await controller.initiateDataExport(tenantId, dto, mockRequest);

      expect(securityService.initiateDataExport).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          reason: 'Legal hold request',
        }),
        'admin-user-123',
        '192.168.1.1',
      );
      expect(result).toEqual({ jobId: 'job-123' });
    });
  });

  describe('initiateDataDeletion', () => {
    it('should initiate data deletion for tenant', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        deletionType: 'full_deletion',
        reason: 'Account termination',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        user: { userId: 'admin-user-123' },
      } as PlatformSecurityRequest;

      const result = await controller.initiateDataDeletion(tenantId, dto, mockRequest);

      expect(securityService.initiateDataDeletion).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          reason: dto.reason,
        }),
        'admin-user-123',
        '192.168.1.1',
      );
      expect(result).toEqual({ deletionId: 'del-123' });
    });
  });

  describe('getSecurityPolicies', () => {
    it('should retrieve tenant risk score', async () => {
      const tenantId = 'tenant-123';

      const result = await controller.getTenantRiskScore(tenantId);

      expect(securityService.getTenantRiskScore).toHaveBeenCalledWith(tenantId);
      expect(securityService.getTenantRiskScore).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual({
        tenantId,
        riskScore: {
          overall: 45,
          factors: [],
        },
      });
    });
  });

  describe('Security Management', () => {
    it('should have getTenantRiskScore method', () => {
      expect(securityService.getTenantRiskScore).toBeDefined();
    });

    it('should have updateIpAllowlist method', () => {
      expect(securityService.updateIpAllowlist).toBeDefined();
    });

    it('should have initiateDataExport method', () => {
      expect(securityService.initiateDataExport).toBeDefined();
    });
  });
});
