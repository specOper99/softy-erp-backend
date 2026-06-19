import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import type { User } from '../../users/entities/user.entity';
import { ImpersonationSession } from '../entities/impersonation-session.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';
import { ImpersonationService } from './impersonation.service';

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let sessionRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let dataSource: { manager: { findOne: jest.Mock }; query: jest.Mock };

  const platformUserId = 'platform-admin-1';
  const tenantId = 'tenant-1';
  const targetUser = { id: 'user-1', email: 'owner@studio.test', tenantId } as User;

  beforeEach(async () => {
    sessionRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((session) => session),
      save: jest
        .fn()
        .mockImplementation((session) =>
          Promise.resolve({ ...session, id: 'session-1', startedAt: new Date(), actionsPerformed: [] }),
        ),
      find: jest.fn(),
      update: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    jwtService = { sign: jest.fn().mockReturnValue('impersonation-token') };
    dataSource = {
      manager: { findOne: jest.fn() },
      query: jest.fn().mockResolvedValue([[], 1]),
    };

    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, callback) => callback());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: getRepositoryToken(ImpersonationSession), useValue: sessionRepository },
        { provide: PlatformAuditService, useValue: auditService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('HS256'),
            getOrThrow: jest.fn().mockReturnValue('jwt-secret-minimum-32-characters-long'),
          },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ImpersonationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts impersonation for an existing tenant user', async () => {
    dataSource.manager.findOne.mockResolvedValue(targetUser);
    sessionRepository.findOne.mockResolvedValue(null);

    const result = await service.startImpersonation(
      tenantId,
      { userId: targetUser.id, reason: 'Support ticket #99' },
      platformUserId,
      '203.0.113.10',
      'Mozilla/5.0',
    );

    expect(result.token).toBe('impersonation-token');
    expect(result.session.id).toBe('session-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: PlatformAction.IMPERSONATION_STARTED }),
    );
  });

  it('rejects impersonation when target user is missing', async () => {
    dataSource.manager.findOne.mockResolvedValue(null);

    await expect(
      service.startImpersonation(
        tenantId,
        { userId: 'missing', reason: 'Support ticket #99' },
        platformUserId,
        '203.0.113.10',
        'Mozilla/5.0',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects duplicate active impersonation sessions', async () => {
    dataSource.manager.findOne.mockResolvedValue(targetUser);
    sessionRepository.findOne.mockResolvedValue({ id: 'existing', isActive: true });

    await expect(
      service.startImpersonation(
        tenantId,
        { userId: targetUser.id, reason: 'Support ticket #99' },
        platformUserId,
        '203.0.113.10',
        'Mozilla/5.0',
      ),
    ).rejects.toThrow(new ConflictException('platform.impersonation_session_exists'));
  });

  it('ends an active impersonation session for the owning platform user', async () => {
    const session = {
      id: 'session-1',
      platformUserId,
      tenantId,
      targetUserId: targetUser.id,
      isActive: true,
      startedAt: new Date(Date.now() - 60_000),
      actionsPerformed: [],
    } as ImpersonationSession;
    sessionRepository.findOne.mockResolvedValue(session);
    sessionRepository.save.mockImplementation((value) => Promise.resolve(value));

    const updated = await service.endImpersonation('session-1', platformUserId, '203.0.113.10', 'Done');

    expect(updated.isActive).toBe(false);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: PlatformAction.IMPERSONATION_ENDED }),
    );
  });

  it('rejects ending a session owned by another platform user', async () => {
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-1',
      platformUserId: 'other-admin',
      isActive: true,
      startedAt: new Date(),
      actionsPerformed: [],
    });

    await expect(service.endImpersonation('session-1', platformUserId, '203.0.113.10')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
