import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Counter } from 'prom-client';
import { Repository } from 'typeorm';
import { PII_FIELD_PATTERNS } from '../../common/decorators/pii.decorator';
import { MetricsFactory } from '../../common/services/metrics.factory';
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

import { AuditPublisher } from './audit.publisher';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

@Injectable()
export class AuditService implements AuditPublisher {
  private readonly logger = new Logger(AuditService.name);
  private readonly auditWriteFailureCounter: Counter<'tenant_id' | 'stage'>;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectQueue('audit-queue') private readonly auditQueue: Queue,
    private readonly metricsFactory: MetricsFactory,
  ) {
    // Best-effort policy: never fail request, but emit a counter for alerting.
    this.auditWriteFailureCounter = this.metricsFactory.getOrCreateCounter({
      name: 'audit_write_failures_total',
      help: 'Total audit log write failures (queue or sync fallback)',
      labelNames: ['tenant_id', 'stage'],
    });
  }

  async log(
    data: CreateAuditLogDto,
    // Removed EntityManager as it is not used in async processing
  ): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const sanitizedData = {
      ...data,
      oldValues: this.sanitize(data.oldValues),
      newValues: this.sanitize(data.newValues),
      tenantId, // Pass tenantId explicitly as context won't exist in worker
    };

    try {
      // Primary path: Async queue processing for performance
      await this.auditQueue.add('log', sanitizedData);
    } catch (queueError) {
      this.auditWriteFailureCounter.inc({ tenant_id: tenantId, stage: 'queue' });
      // Fallback: Synchronous write if queue is unavailable
      this.logger.warn(
        `Audit queue unavailable, falling back to synchronous write: ${queueError instanceof Error ? queueError.message : String(queueError)}`,
      );

      try {
        // Direct synchronous insert as fallback
        const auditLog = this.auditRepository.create(sanitizedData);
        await this.auditRepository.save(auditLog);
        this.logger.debug('Audit log saved synchronously as fallback');
      } catch (dbError) {
        this.auditWriteFailureCounter.inc({ tenant_id: tenantId, stage: 'sync' });
        // Log error but don't throw to avoid breaking main flow
        this.logger.error(
          `Failed to save audit log (both queue and sync): ${dbError instanceof Error ? dbError.message : String(dbError)}`,
          { auditData: sanitizedData },
        );
      }
    }
  }

  async verifyChainIntegrity(tenantId: string, limit = 1000): Promise<ChainVerificationResult> {
    const logs = await this.auditRepository.find({
      where: { tenantId },
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

  async findAllCursor(query: AuditLogFilterDto): Promise<{ data: AuditLog[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

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
    const tenantId = TenantContextService.getTenantIdOrThrow();
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
        (pattern) => pattern === lowerKey || lowerKey.includes(pattern.replace(/_/g, '')),
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
