import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformAuditLog } from '../entities/platform-audit-log.entity';
import { PlatformAction } from '../enums/platform-action.enum';

export interface CreateAuditLogDto {
  platformUserId: string;
  action: PlatformAction;
  targetTenantId?: string;
  targetUserId?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  reason?: string;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
  changesBefore?: Record<string, unknown>;
  changesAfter?: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
  additionalContext?: Record<string, unknown>;
}

/**
 * Service for managing immutable platform audit logs
 * All platform actions must be logged for compliance and security
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  private readonly maxListLimit = 100;

  constructor(
    @InjectRepository(PlatformAuditLog)
    private readonly auditLogRepository: Repository<PlatformAuditLog>,
  ) {}

  /**
   * Create an audit log entry
   * This is append-only, logs are never modified or deleted
   */
  async log(dto: CreateAuditLogDto): Promise<PlatformAuditLog> {
    try {
      const auditLog = this.auditLogRepository.create({
        ...dto,
        success: dto.success ?? true,
      });

      const saved = await this.auditLogRepository.save(auditLog);

      this.logger.log(
        `Platform audit: ${dto.action} by ${dto.platformUserId} ${dto.targetTenantId ? `on tenant ${dto.targetTenantId}` : ''}`,
      );

      return saved;
    } catch (error) {
      // Audit logging failure should not crash the application
      // but should be logged with high severity
      this.logger.error('Failed to create audit log', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  /**
   * Query audit logs with filters
   */
  async findAll(options: {
    platformUserId?: string;
    action?: PlatformAction;
    targetTenantId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: PlatformAuditLog[]; total: number }> {
    const limit =
      typeof options.limit === 'number' && Number.isFinite(options.limit)
        ? Math.min(this.maxListLimit, Math.max(1, Math.trunc(options.limit)))
        : 100;
    const offset =
      typeof options.offset === 'number' && Number.isFinite(options.offset)
        ? Math.max(0, Math.trunc(options.offset))
        : 0;

    const qb = this.auditLogRepository.createQueryBuilder('log').leftJoinAndSelect('log.platformUser', 'user');

    if (options.platformUserId) {
      qb.andWhere('log.platformUserId = :userId', {
        userId: options.platformUserId,
      });
    }

    if (options.action) {
      qb.andWhere('log.action = :action', { action: options.action });
    }

    if (options.targetTenantId) {
      qb.andWhere('log.targetTenantId = :tenantId', {
        tenantId: options.targetTenantId,
      });
    }

    if (options.startDate) {
      qb.andWhere('log.performedAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options.endDate) {
      qb.andWhere('log.performedAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    const total = await qb.getCount();

    qb.orderBy('log.performedAt', 'DESC').limit(limit).offset(offset);

    const logs = await qb.getMany();

    return { logs, total };
  }

  /**
   * Get audit trail for a specific tenant
   */
  async getTenantAuditTrail(tenantId: string, limit = 100): Promise<PlatformAuditLog[]> {
    const effectiveLimit = Math.min(this.maxListLimit, Math.max(1, Math.trunc(limit)));
    return this.auditLogRepository.find({
      where: { targetTenantId: tenantId },
      relations: ['platformUser'],
      order: { performedAt: 'DESC' },
      take: effectiveLimit,
    });
  }

  /**
   * Get recent actions by a platform user
   */
  async getUserRecentActions(platformUserId: string, limit = 50): Promise<PlatformAuditLog[]> {
    const effectiveLimit = Math.min(this.maxListLimit, Math.max(1, Math.trunc(limit)));
    return this.auditLogRepository.find({
      where: { platformUserId },
      order: { performedAt: 'DESC' },
      take: effectiveLimit,
    });
  }
}
