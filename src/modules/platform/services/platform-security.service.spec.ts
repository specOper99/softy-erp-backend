import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformSecurityService } from './platform-security.service';

describe('PlatformSecurityService', () => {
  let service: PlatformSecurityService;
  let tenantRepository: Repository<Tenant>;
  let auditService: PlatformAuditService;
  let _passwordHashService: PasswordHashService;

  const mockTenant: Partial<Tenant> = {
    id: 'tenant-123',
    name: 'Test Tenant',
    riskScore: 25,
    securityPolicies: {},
    complianceFlags: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSecurityService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: PlatformAuditService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: PasswordHashService,
          useValue: {
            hash: jest.fn(),
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformSecurityService>(PlatformSecurityService);
    tenantRepository = module.get(getRepositoryToken(Tenant));
    auditService = module.get<PlatformAuditService>(PlatformAuditService);
    _passwordHashService = module.get<PasswordHashService>(PasswordHashService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forcePasswordReset', () => {
    it('should log password reset action', async () => {
      const dto = { userId: 'user-123', reason: 'Account compromised' };
      const logSpy = jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      await service.forcePasswordReset(dto, 'admin-123', '192.168.1.1');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.FORCE_PASSWORD_RESET,
          reason: dto.reason,
        }),
      );
    });
  });

  describe('revokeAllSessions', () => {
    it('should throw NotFoundException for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      const dto = { tenantId: 'non-existent', reason: 'Security breach' };

      await expect(service.revokeAllSessions(dto, 'admin-123', '192.168.1.1')).rejects.toThrow(NotFoundException);
    });

    it('should log session revocation for valid tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      const logSpy = jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const dto = { tenantId: 'tenant-123', reason: 'Security incident' };
      await service.revokeAllSessions(dto, 'admin-123', '192.168.1.1');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.SESSIONS_REVOKED,
          targetTenantId: dto.tenantId,
        }),
      );
    });
  });

  describe('updateIpAllowlist', () => {
    it('should throw NotFoundException for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      const dto = {
        tenantId: 'non-existent',
        allowedIps: ['10.0.0.0/8'],
        reason: 'Security policy',
      };

      await expect(service.updateIpAllowlist(dto, 'admin-123', '192.168.1.1')).rejects.toThrow(NotFoundException);
    });

    it('should validate CIDR format', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);

      const dto = {
        tenantId: 'tenant-123',
        allowedIps: ['invalid-ip'],
        reason: 'Security policy',
      };

      await expect(service.updateIpAllowlist(dto, 'admin-123', '192.168.1.1')).rejects.toThrow();
    });

    it('should update IP allowlist with valid CIDR', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      const saveSpy = jest.spyOn(tenantRepository, 'save').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const dto = {
        tenantId: 'tenant-123',
        allowedIps: ['10.0.0.0/8', '192.168.1.0/24'],
        reason: 'Security policy update',
      };

      await service.updateIpAllowlist(dto, 'admin-123', '192.168.1.1');

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          securityPolicies: expect.objectContaining({
            ipAllowlist: dto.allowedIps,
          }),
        }),
      );
    });

    it('should accept IPv4 addresses without CIDR', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(tenantRepository, 'save').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const dto = {
        tenantId: 'tenant-123',
        allowedIps: ['192.168.1.1'],
        reason: 'Single IP allowlist',
      };

      await expect(service.updateIpAllowlist(dto, 'admin-123', '192.168.1.1')).resolves.not.toThrow();
    });
  });

  describe('initiateDataExport', () => {
    it('should throw NotFoundException for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      const dto = {
        tenantId: 'non-existent',
        exportType: 'gdpr' as const,
        reason: 'GDPR request',
      };

      await expect(service.initiateDataExport(dto, 'admin-123', '192.168.1.1')).rejects.toThrow(NotFoundException);
    });

    it('should return export ID and estimated completion time', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const dto = {
        tenantId: 'tenant-123',
        exportType: 'gdpr' as const,
        reason: 'GDPR data export request',
      };

      const result = await service.initiateDataExport(dto, 'admin-123', '192.168.1.1');

      expect(result).toHaveProperty('exportId');
      expect(result).toHaveProperty('estimatedCompletionTime');
      expect(result.exportId).toContain('export-');
    });

    it('should log data export action', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      const logSpy = jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const dto = {
        tenantId: 'tenant-123',
        exportType: 'full' as const,
        reason: 'Full data export',
      };

      await service.initiateDataExport(dto, 'admin-123', '192.168.1.1');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.DATA_EXPORTED,
          targetTenantId: dto.tenantId,
        }),
      );
    });
  });

  describe('initiateDataDeletion', () => {
    it('should throw NotFoundException for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      const dto = {
        tenantId: 'non-existent',
        scheduleDate: new Date(),
        reason: 'GDPR right to be forgotten',
      };

      await expect(service.initiateDataDeletion(dto, 'admin-123', '192.168.1.1')).rejects.toThrow(NotFoundException);
    });

    it('should schedule data deletion', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      const saveSpy = jest.spyOn(tenantRepository, 'save').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const scheduleDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const dto = {
        tenantId: 'tenant-123',
        scheduleDate,
        reason: 'Account closure requested',
      };

      await service.initiateDataDeletion(dto, 'admin-123', '192.168.1.1');

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deletionScheduledAt: scheduleDate,
        }),
      );
    });
  });

  describe('getTenantRiskScore', () => {
    it('should throw NotFoundException for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getTenantRiskScore('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return risk score for existing tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);

      const result = await service.getTenantRiskScore('tenant-123');

      expect(result).toBe(25);
    });

    it('should return 0 for tenant without risk score', async () => {
      const tenantWithoutScore = { ...mockTenant, riskScore: 0 };
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(tenantWithoutScore as Tenant);

      const result = await service.getTenantRiskScore('tenant-123');

      expect(result).toBe(0);
    });
  });

  describe('updateSecurityPolicy', () => {
    it('should throw NotFoundException for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateSecurityPolicy('non-existent', { mfaRequired: true }, 'admin-123', 'Enable MFA', '192.168.1.1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update security policy', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      const saveSpy = jest.spyOn(tenantRepository, 'save').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(auditService, 'log').mockResolvedValue(undefined);

      const policy = { mfaRequired: true, sessionTimeout: 3600 };

      await service.updateSecurityPolicy('tenant-123', policy, 'admin-123', 'Update security', '192.168.1.1');

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          securityPolicies: expect.objectContaining(policy),
        }),
      );
    });
  });
});
