import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { EntityManager, Repository } from 'typeorm';
import { PII_FIELD_PATTERNS } from '../../common/decorators/pii.decorator';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../common/utils/cursor-pagination.helper';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLog } from './entities/audit-log.entity';

export interface ChainVerificationResult {
  valid: boolean;
  totalChecked: number;
  brokenAt?: string;
  errorMessage?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectQueue('audit-queue') private readonly auditQueue: Queue,
  ) {}

  async log(
    data: {
      userId?: string;
      action: string;
      entityName: string;
      entityId: string;
      oldValues?: unknown;
      newValues?: unknown;
      notes?: string;
      ipAddress?: string;
      userAgent?: string;
      method?: string;
      path?: string;
      statusCode?: number;
      durationMs?: number;
    },
    _manager?: EntityManager,
  ): Promise<void> {
    try {
      const tenantId = TenantContextService.getTenantId();

      // We ignore the manager here as we are moving to async processing
      // If immediate consistency within transaction was required, this changes semantics,
      // but Requirement #5 explicitly requested off-loading to remove bottleneck.

      await this.auditQueue.add('log', {
        ...data,
        oldValues: this.sanitize(data.oldValues),
        newValues: this.sanitize(data.newValues),
        tenantId, // Pass tenantId explicitly as context won't exist in worker
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue audit log: ${error instanceof Error ? error.message : String(error)}`,
        { auditData: data },
      );
      // We do not rethrow to avoid breaking the main flow if audit queue fails
    }
  }

  async verifyChainIntegrity(
    tenantId?: string,
    limit = 1000,
  ): Promise<ChainVerificationResult> {
    const effectiveTenantId = tenantId ?? TenantContextService.getTenantId();

    const logs = await this.auditRepository.find({
      where: { tenantId: effectiveTenantId },
      order: { sequenceNumber: 'ASC' },
      take: limit,
    });

    if (logs.length === 0) {
      return { valid: true, totalChecked: 0 };
    }

    let previousHash: string | null = null;

    for (const log of logs) {
      if (log.previousHash !== previousHash) {
        return {
          valid: false,
          totalChecked: logs.indexOf(log) + 1,
          brokenAt: log.id,
          errorMessage: `Chain broken at log ${log.id}: expected previousHash ${previousHash}, got ${log.previousHash}`,
        };
      }

      if (!log.verifyHash()) {
        return {
          valid: false,
          totalChecked: logs.indexOf(log) + 1,
          brokenAt: log.id,
          errorMessage: `Hash mismatch at log ${log.id}: computed hash does not match stored hash`,
        };
      }

      previousHash = log.hash;
    }

    return { valid: true, totalChecked: logs.length };
  }

  async findAllCursor(
    query: AuditLogFilterDto,
  ): Promise<{ data: AuditLog[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantId();

    const queryBuilder = this.auditRepository.createQueryBuilder('audit');

    queryBuilder.where('audit.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginate(queryBuilder, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'audit',
      filters: (qb) => {
        if (query.entityName) {
          qb.andWhere('audit.entityName = :entityName', {
            entityName: query.entityName,
          });
        }

        if (query.action) {
          qb.andWhere('audit.action = :action', { action: query.action });
        }

        if (query.userId) {
          qb.andWhere('audit.userId = :userId', { userId: query.userId });
        }

        if (query.startDate) {
          qb.andWhere('audit.createdAt >= :startDate', {
            startDate: new Date(query.startDate),
          });
        }

        if (query.endDate) {
          qb.andWhere('audit.createdAt <= :endDate', {
            endDate: new Date(query.endDate),
          });
        }
      },
    });
  }

  async findOne(id: string): Promise<AuditLog | null> {
    const tenantId = TenantContextService.getTenantId();
    return this.auditRepository.findOne({
      where: { id, tenantId },
    });
  }

  private sanitize(data: unknown): unknown {
    if (!data) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    const sanitized: Record<string, unknown> = { ...data };
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
      const isSensitive = PII_FIELD_PATTERNS.some(
        (pattern) =>
          pattern === lowerKey || lowerKey.includes(pattern.replace(/_/g, '')),
      );

      if (isSensitive) {
        sanitized[key] = '***MASKED***';
      } else {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    return sanitized;
  }
}
