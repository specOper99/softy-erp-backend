import { ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { createHash } from 'node:crypto';
import { DataSource, LessThan, Repository } from 'typeorm';
import { User } from '../../../modules/users/entities/user.entity';
import { StartImpersonationDto } from '../dto/support.dto';
import { ImpersonationSession } from '../entities/impersonation-session.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';

/**
 * Service for managing tenant user impersonation for support purposes
 * All impersonation sessions are logged and tracked
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    @InjectRepository(ImpersonationSession)
    private readonly sessionRepository: Repository<ImpersonationSession>,
    private readonly auditService: PlatformAuditService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Start an impersonation session
   */
  async startImpersonation(
    dto: StartImpersonationDto,
    platformUserId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ session: ImpersonationSession; token: string }> {
    // Fetch target user to validate existence and get email for audit trail
    const targetUser = await this.dataSource.manager.findOne(User, {
      where: { id: dto.userId, tenantId: dto.tenantId },
      select: ['id', 'email', 'tenantId'],
    });

    if (!targetUser) {
      throw new NotFoundException(`User ${dto.userId} not found in tenant ${dto.tenantId}`);
    }

    // Check if there's already an active session
    const activeSession = await this.sessionRepository.findOne({
      where: {
        platformUserId,
        tenantId: dto.tenantId,
        targetUserId: dto.userId,
        isActive: true,
      },
    });

    if (activeSession) {
      throw new ConflictException('An active impersonation session already exists for this user');
    }

    // Generate session token
    const sessionToken = randomBytes(32).toString('hex');
    const sessionTokenHash = this.hashToken(sessionToken);

    // Create session with verified user email
    const session = this.sessionRepository.create({
      platformUserId,
      tenantId: dto.tenantId,
      targetUserId: dto.userId,
      targetUserEmail: targetUser.email,
      reason: dto.reason,
      approvalTicketId: dto.approvalTicketId,
      sessionTokenHash,
      ipAddress,
      userAgent,
      isActive: true,
    });

    let saved: ImpersonationSession;
    try {
      saved = await this.sessionRepository.save(session);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
        throw new ConflictException('An active impersonation session already exists for this user');
      }
      throw error;
    }

    // Generate JWT for impersonation
    const algorithm = this.resolveJwtAlgorithm();
    const signingOptions =
      algorithm === 'RS256'
        ? {
            algorithm,
            privateKey: this.configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
          }
        : {
            algorithm,
            secret: this.configService.getOrThrow<string>('auth.jwtSecret'),
          };

    const token = this.jwtService.sign(
      {
        sub: dto.userId,
        tenantId: dto.tenantId,
        impersonatedBy: platformUserId,
        impersonationSessionId: saved.id,
        aud: 'tenant', // Impersonation uses tenant context
      },
      {
        expiresIn: '4h', // Shorter expiry for impersonation
        ...signingOptions,
      },
    );

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.IMPERSONATION_STARTED,
      targetTenantId: dto.tenantId,
      targetUserId: dto.userId,
      ipAddress,
      userAgent,
      reason: dto.reason,
      additionalContext: {
        sessionId: saved.id,
        approvalTicketId: dto.approvalTicketId,
      },
    });

    this.logger.warn(
      `Impersonation started: Platform user ${platformUserId} → Tenant ${dto.tenantId} User ${dto.userId}`,
    );

    return { session: saved, token };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolveJwtAlgorithm(): 'HS256' | 'RS256' {
    const rawAlgorithms = this.configService.get<string>('JWT_ALLOWED_ALGORITHMS') ?? 'HS256';
    const parsed = rawAlgorithms
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter((a): a is 'HS256' | 'RS256' => a === 'HS256' || a === 'RS256');

    const unique = Array.from(new Set(parsed));
    if (unique.length !== 1) {
      throw new Error('JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256');
    }

    return unique[0] ?? 'HS256';
  }

  /**
   * End an impersonation session
   */
  async endImpersonation(
    sessionId: string,
    platformUserId: string,
    ipAddress: string,
    endReason?: string,
  ): Promise<ImpersonationSession> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Impersonation session not found');
    }

    if (!session.isActive) {
      throw new ConflictException('Session is already ended');
    }

    if (session.platformUserId !== platformUserId) {
      throw new UnauthorizedException('You can only end your own impersonation sessions');
    }

    session.isActive = false;
    session.endedAt = new Date();
    session.endedBy = platformUserId;
    session.endReason = endReason || 'Manually ended by user';

    const updated = await this.sessionRepository.save(session);

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.IMPERSONATION_ENDED,
      targetTenantId: session.tenantId,
      targetUserId: session.targetUserId,
      ipAddress,
      reason: endReason,
      additionalContext: {
        sessionId: session.id,
        duration: session.endedAt.getTime() - session.startedAt.getTime(),
        actionsPerformed: session.actionsPerformed.length,
      },
    });

    this.logger.log(`Impersonation ended: Session ${sessionId}`);

    return updated;
  }

  /**
   * Get active impersonation sessions for a platform user
   */
  async getActiveSessions(platformUserId: string): Promise<ImpersonationSession[]> {
    return this.sessionRepository.find({
      where: {
        platformUserId,
        isActive: true,
      },
      order: { startedAt: 'DESC' },
      take: 100,
    });
  }

  /**
   * Get impersonation history
   */
  async getHistory(platformUserId: string, limit = 50): Promise<ImpersonationSession[]> {
    return this.sessionRepository.find({
      where: { platformUserId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Log an action performed during impersonation
   */
  async logAction(sessionId: string, action: string, endpoint: string, method: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      return;
    }

    session.actionsPerformed.push({
      action,
      timestamp: new Date(),
      endpoint,
      method,
    });

    await this.sessionRepository.save(session);
  }

  /**
   * Automatically end sessions that exceed time limit
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const result = await this.sessionRepository.update(
      {
        isActive: true,
        startedAt: LessThan(fourHoursAgo),
      },
      {
        isActive: false,
        endedAt: now,
        endReason: 'Automatically ended due to timeout (4 hours)',
      },
    );

    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Cleaned up ${result.affected} expired impersonation sessions`);
    }
  }
}
