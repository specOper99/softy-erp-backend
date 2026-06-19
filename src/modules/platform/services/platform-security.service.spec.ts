import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { PasswordService } from '../../auth/services/password.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformSecurityService } from './platform-security.service';

describe('PlatformSecurityService', () => {
  let service: PlatformSecurityService;
  let userRepository: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let tenantRepository: { findOne: jest.Mock; save: jest.Mock };
  let refreshTokenRepository: { update: jest.Mock; createQueryBuilder: jest.Mock };
  let auditService: { log: jest.Mock };
  let passwordHashService: { hash: jest.Mock };
  let passwordService: { forgotPassword: jest.Mock };

  const platformUserId = 'platform-admin-1';
  const ipAddress = '203.0.113.10';
  const tenantId = 'tenant-1';
  const user = {
    id: 'user-1',
    tenantId,
    email: 'owner@studio.test',
  } as User;

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    tenantRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    refreshTokenRepository = {
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    passwordHashService = { hash: jest.fn().mockResolvedValue('new-hash') };
    passwordService = { forgotPassword: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSecurityService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepository },
        { provide: PlatformAuditService, useValue: auditService },
        { provide: PasswordHashService, useValue: passwordHashService },
        { provide: PasswordService, useValue: passwordService },
      ],
    }).compile();

    service = module.get(PlatformSecurityService);
  });

  it('forcePasswordReset updates password, revokes sessions, and audits', async () => {
    userRepository.findOne.mockResolvedValue(user);

    await service.forcePasswordReset(
      { tenantId, userId: user.id, reason: 'Support ticket #42' },
      platformUserId,
      ipAddress,
    );

    expect(passwordHashService.hash).toHaveBeenCalled();
    expect(userRepository.update).toHaveBeenCalledWith(
      { id: user.id, tenantId: user.tenantId },
      { passwordHash: 'new-hash' },
    );
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );
    expect(passwordService.forgotPassword).toHaveBeenCalledWith(user.email);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PlatformAction.FORCE_PASSWORD_RESET,
        targetEntityId: user.id,
      }),
    );
  });

  it('forcePasswordReset skips invalid email notification', async () => {
    userRepository.findOne.mockResolvedValue({ ...user, email: 'not-an-email' });

    await service.forcePasswordReset(
      { tenantId, userId: user.id, reason: 'Support ticket #42', notifyUser: true },
      platformUserId,
      ipAddress,
    );

    expect(passwordService.forgotPassword).not.toHaveBeenCalled();
  });

  it('forcePasswordReset rejects unknown tenant user', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(
      service.forcePasswordReset(
        { tenantId, userId: 'missing', reason: 'Support ticket #42' },
        platformUserId,
        ipAddress,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('revokeAllSessions returns zero when tenant has no users', async () => {
    tenantRepository.findOne.mockResolvedValue({ id: tenantId } as Tenant);
    userRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    await expect(
      service.revokeAllSessions({ tenantId, reason: 'Security incident response' }, platformUserId, ipAddress),
    ).resolves.toBe(0);
  });

  it('updateIpAllowlist rejects invalid CIDR values', async () => {
    tenantRepository.findOne.mockResolvedValue({ id: tenantId, securityPolicies: {} } as Tenant);

    await expect(
      service.updateIpAllowlist(
        { tenantId, allowedIps: ['999.999.999.999/99'], reason: 'Tighten tenant access' },
        platformUserId,
        ipAddress,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('initiateDataExport returns export metadata and audits', async () => {
    tenantRepository.findOne.mockResolvedValue({ id: tenantId } as Tenant);

    const result = await service.initiateDataExport(
      { tenantId, exportType: 'gdpr', reason: 'Customer data request' },
      platformUserId,
      ipAddress,
    );

    expect(result.exportId).toMatch(/^export-/);
    expect(result.estimatedCompletionTime).toBeInstanceOf(Date);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: PlatformAction.DATA_EXPORTED }));
  });
});
