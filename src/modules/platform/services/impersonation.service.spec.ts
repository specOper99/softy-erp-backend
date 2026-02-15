import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { ImpersonationSession } from '../entities/impersonation-session.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { ImpersonationService } from './impersonation.service';
import { PlatformAuditService } from './platform-audit.service';

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let sessionRepository: jest.Mocked<Repository<ImpersonationSession>>;
  let auditService: jest.Mocked<PlatformAuditService>;
  let jwtService: jest.Mocked<JwtService>;

  const platformUserId = 'platform-user-123';
  const ipAddress = '192.168.1.100';
  const userAgent = 'Mozilla/5.0';

  const mockSession: Partial<ImpersonationSession> = {
    id: 'session-123',
    platformUserId,
    tenantId: 'tenant-456',
    targetUserId: 'user-789',
    targetUserEmail: 'user@tenant.com',
    reason: 'Customer support request',
    sessionTokenHash: 'mock-token-hash',
    ipAddress,
    userAgent,
    isActive: true,
    startedAt: new Date(),
    actionsPerformed: [],
  };

  beforeEach(async () => {
    const mockSessionRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_ALLOWED_ALGORITHMS') return 'HS256';
        return undefined;
      }),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'auth.jwtSecret') return 'test-jwt-secret';
        if (key === 'JWT_PRIVATE_KEY') return 'test-private-key';
        throw new Error(`Config key not found: ${key}`);
      }),
    };

    const mockDataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: 'user@example.com',
          tenantId: 'tenant-456',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        {
          provide: getRepositoryToken(ImpersonationSession),
          useValue: mockSessionRepository,
        },
        {
          provide: PlatformAuditService,
          useValue: mockAuditService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ImpersonationService>(ImpersonationService);
    sessionRepository = module.get(getRepositoryToken(ImpersonationSession));
    auditService = module.get(PlatformAuditService);
    jwtService = module.get(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startImpersonation', () => {
    const dto = {
      tenantId: 'tenant-456',
      userId: 'user-789',
      reason: 'Customer reported billing issue - Ticket #12345',
      approvalTicketId: 'TICKET-12345',
    };

    it('should create impersonation session successfully', async () => {
      sessionRepository.findOne.mockResolvedValue(null); // No existing session
      sessionRepository.create.mockReturnValue(mockSession as ImpersonationSession);
      sessionRepository.save.mockResolvedValue(mockSession as ImpersonationSession);

      const result = await service.startImpersonation(dto, platformUserId, ipAddress, userAgent);

      expect(result).toHaveProperty('session');
      expect(result).toHaveProperty('token');
      expect(result.token).toBe('mock-jwt-token');
    });

    it('should store target user email from DB in session', async () => {
      sessionRepository.findOne.mockResolvedValue(null);
      sessionRepository.create.mockReturnValue(mockSession as ImpersonationSession);
      sessionRepository.save.mockResolvedValue(mockSession as ImpersonationSession);

      await service.startImpersonation(dto, platformUserId, ipAddress, userAgent);

      // Verify create was called with email from the mocked DataSource user
      // The global mock returns { email: 'user@example.com' }
      expect(sessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserEmail: 'user@example.com',
        }),
      );
    });

    it('should generate JWT with correct payload', async () => {
      sessionRepository.findOne.mockResolvedValue(null);
      sessionRepository.create.mockReturnValue(mockSession as ImpersonationSession);
      sessionRepository.save.mockResolvedValue(mockSession as ImpersonationSession);

      await service.startImpersonation(dto, platformUserId, ipAddress, userAgent);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: dto.userId,
          tenantId: dto.tenantId,
          impersonatedBy: platformUserId,
          aud: 'tenant',
        }),
        expect.objectContaining({
          expiresIn: '4h',
        }),
      );
    });

    it('should log impersonation start to audit', async () => {
      sessionRepository.findOne.mockResolvedValue(null);
      sessionRepository.create.mockReturnValue(mockSession as ImpersonationSession);
      sessionRepository.save.mockResolvedValue(mockSession as ImpersonationSession);

      await service.startImpersonation(dto, platformUserId, ipAddress, userAgent);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          platformUserId,
          action: PlatformAction.IMPERSONATION_STARTED,
          targetTenantId: dto.tenantId,
          targetUserId: dto.userId,
          reason: dto.reason,
        }),
      );
    });

    it('should throw ConflictException if active session exists', async () => {
      sessionRepository.findOne.mockResolvedValue(mockSession as ImpersonationSession);

      await expect(service.startImpersonation(dto, platformUserId, ipAddress, userAgent)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should map unique-constraint insert race to ConflictException', async () => {
      sessionRepository.findOne.mockResolvedValue(null);
      sessionRepository.create.mockReturnValue(mockSession as ImpersonationSession);
      sessionRepository.save.mockRejectedValue({ code: '23505' });

      await expect(service.startImpersonation(dto, platformUserId, ipAddress, userAgent)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should include approval ticket ID when provided', async () => {
      sessionRepository.findOne.mockResolvedValue(null);
      sessionRepository.create.mockReturnValue(mockSession as ImpersonationSession);
      sessionRepository.save.mockResolvedValue(mockSession as ImpersonationSession);

      await service.startImpersonation(dto, platformUserId, ipAddress, userAgent);

      expect(sessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalTicketId: dto.approvalTicketId,
        }),
      );
    });
  });

  describe('endImpersonation', () => {
    it('should end active session successfully', async () => {
      const activeSession = { ...mockSession, isActive: true } as ImpersonationSession;
      sessionRepository.findOne.mockResolvedValue(activeSession);
      sessionRepository.save.mockResolvedValue({
        ...activeSession,
        isActive: false,
        endedAt: new Date(),
      } as ImpersonationSession);

      const result = await service.endImpersonation('session-123', platformUserId, ipAddress, 'Support complete');

      expect(result.isActive).toBe(false);
      expect(sessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          endReason: 'Support complete',
        }),
      );
    });

    it('should throw NotFoundException for non-existent session', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      await expect(service.endImpersonation('nonexistent', platformUserId, ipAddress)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if session already ended', async () => {
      const endedSession = { ...mockSession, isActive: false } as ImpersonationSession;
      sessionRepository.findOne.mockResolvedValue(endedSession);

      await expect(service.endImpersonation('session-123', platformUserId, ipAddress)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw UnauthorizedException if not session owner', async () => {
      const otherUserSession = {
        ...mockSession,
        platformUserId: 'other-user',
      } as ImpersonationSession;
      sessionRepository.findOne.mockResolvedValue(otherUserSession);

      await expect(service.endImpersonation('session-123', platformUserId, ipAddress)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should log impersonation end to audit', async () => {
      const activeSession = {
        ...mockSession,
        isActive: true,
        actionsPerformed: [{ action: 'view_booking' }],
      } as ImpersonationSession;
      sessionRepository.findOne.mockResolvedValue(activeSession);
      sessionRepository.save.mockImplementation((s) =>
        Promise.resolve({
          ...s,
          endedAt: new Date(),
        } as ImpersonationSession),
      );

      await service.endImpersonation('session-123', platformUserId, ipAddress);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PlatformAction.IMPERSONATION_ENDED,
          targetTenantId: mockSession.tenantId,
          targetUserId: mockSession.targetUserId,
        }),
      );
    });

    it('should use default end reason if not provided', async () => {
      const activeSession = { ...mockSession, isActive: true } as ImpersonationSession;
      sessionRepository.findOne.mockResolvedValue(activeSession);
      sessionRepository.save.mockResolvedValue(activeSession);

      await service.endImpersonation('session-123', platformUserId, ipAddress);

      expect(sessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          endReason: 'Manually ended by user',
        }),
      );
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions for platform user', async () => {
      const activeSessions = [mockSession as ImpersonationSession];
      sessionRepository.find.mockResolvedValue(activeSessions);

      const result = await service.getActiveSessions(platformUserId);

      expect(result).toEqual(activeSessions);
      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: {
          platformUserId,
          isActive: true,
        },
        order: { startedAt: 'DESC' },
        take: 100,
      });
    });

    it('should return empty array when no active sessions', async () => {
      sessionRepository.find.mockResolvedValue([]);

      const result = await service.getActiveSessions(platformUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('should return session history with default limit', async () => {
      const sessions = [mockSession as ImpersonationSession];
      sessionRepository.find.mockResolvedValue(sessions);

      const result = await service.getHistory(platformUserId);

      expect(result).toEqual(sessions);
      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: { platformUserId },
        order: { startedAt: 'DESC' },
        take: 50,
      });
    });

    it('should respect custom limit', async () => {
      sessionRepository.find.mockResolvedValue([]);

      await service.getHistory(platformUserId, 10);

      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: { platformUserId },
        order: { startedAt: 'DESC' },
        take: 10,
      });
    });
  });

  describe('logAction', () => {
    it('should add action to session log', async () => {
      const session = {
        ...mockSession,
        actionsPerformed: [],
      } as ImpersonationSession;
      sessionRepository.findOne.mockResolvedValue(session);
      sessionRepository.save.mockResolvedValue(session);

      await service.logAction('session-123', 'view_booking', '/bookings/123', 'GET');

      expect(sessionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actionsPerformed: expect.arrayContaining([
            expect.objectContaining({
              action: 'view_booking',
              endpoint: '/bookings/123',
              method: 'GET',
            }),
          ]),
        }),
      );
    });

    it('should silently return if session not found', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      // Should not throw
      await expect(service.logAction('nonexistent', 'action', '/endpoint', 'GET')).resolves.toBeUndefined();

      expect(sessionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should use a set-based update for sessions older than 4 hours', async () => {
      sessionRepository.update.mockResolvedValue({ affected: 2, generatedMaps: [], raw: {} });

      await service.cleanupExpiredSessions();

      expect(sessionRepository.update).toHaveBeenCalledWith(
        {
          isActive: true,
          startedAt: LessThan(expect.any(Date)),
        },
        {
          isActive: false,
          endedAt: expect.any(Date),
          endReason: 'Automatically ended due to timeout (4 hours)',
        },
      );
      expect(sessionRepository.find).not.toHaveBeenCalled();
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });

    it('should still avoid per-row operations when no sessions are expired', async () => {
      sessionRepository.update.mockResolvedValue({ affected: 0, generatedMaps: [], raw: {} });

      await service.cleanupExpiredSessions();

      expect(sessionRepository.update).toHaveBeenCalledTimes(1);
      expect(sessionRepository.find).not.toHaveBeenCalled();
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });
  });
});
