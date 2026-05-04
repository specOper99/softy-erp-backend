import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Counter } from 'prom-client';
import { DataSource } from 'typeorm';
import { PII_FIELD_PATTERNS } from '../../common/decorators/pii.decorator';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../common/utils/cursor-pagination.helper';
import { toErrorMessage } from '../../common/utils/error.util';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLog } from './entities/audit-log.entity';

export interface ChainVerificationResult {
  valid: boolean;
  totalChecked: number;
  brokenAt?: string;
  errorMessage?: string;
}

import { RuntimeFailure } from '../../common/errors/runtime-failure';
import { AuditPublisher } from './audit.publisher';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogRepository } from './repositories/audit-log.repository';

@Injectable()
export class AuditService implements AuditPublisher {
  private readonly logger = new Logger(AuditService.name);
  private readonly auditWriteFailureCounter: Counter<'tenant_id' | 'stage'>;

  constructor(
    private readonly auditRepository: AuditLogRepository,
    private readonly metricsFactory: MetricsFactory,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @InjectQueue('audit-queue') private readonly auditQueue?: Queue,
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
      oldValues: this.sanitize(data.oldValues) as Record<string, unknown> | null | undefined,
      newValues: this.sanitize(data.newValues) as Record<string, unknown> | null | undefined,
      tenantId, // Pass tenantId explicitly as context won't exist in worker
    };

    try {
      // Primary path: Async queue processing for performance
      if (!this.auditQueue) {
        throw new RuntimeFailure('Audit queue not available');
      }
      await this.auditQueue.add('log', sanitizedData);
    } catch (queueError) {
      this.auditWriteFailureCounter.inc({ tenant_id: tenantId, stage: 'queue' });
      // Fallback: Synchronous write if queue is unavailable
      this.logger.warn(`Audit queue unavailable, falling back to synchronous write: ${toErrorMessage(queueError)}`);

      try {
        // Synchronous fallback: must maintain hash chain integrity.
        // Uses the same advisory lock as the queue processor to prevent races.
        await this.dataSource.transaction(async (manager) => {
          await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [tenantId]);

          const auditRepo = manager.getRepository(AuditLog);
          const lastLog = await auditRepo.findOne({
            where: { tenantId },
            order: { sequenceNumber: 'DESC' },
            select: ['hash', 'sequenceNumber'],
          });

          const entry = auditRepo.create({
            ...sanitizedData,
            previousHash: lastLog?.hash ?? undefined,
            sequenceNumber: (lastLog?.sequenceNumber ?? 0) + 1,
          });
          entry.createdAt = new Date();
          entry.hash = entry.calculateHash();

          await auditRepo.save(entry);
        });
        this.logger.debug('Audit log saved synchronously as fallback');
      } catch (dbError) {
        this.auditWriteFailureCounter.inc({ tenant_id: tenantId, stage: 'sync' });
        // Log error but don't throw to avoid breaking main flow
        this.logger.error(`Failed to save audit log (both queue and sync): ${toErrorMessage(dbError)}`, {
          auditData: sanitizedData,
        });
      }
    }
  }

  async verifyChainIntegrity(tenantId: string, limit = 1000): Promise<ChainVerificationResult> {
    const MAX_LIMIT = 1000;
    const effectiveLimit = Number.isFinite(limit) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit))) : 1000;
    // Exclude DLQ entries (sequenceNumber IS NULL) — they are not part of the integrity chain.
    const logs = await this.auditRepository
      .createQueryBuilder('audit')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.sequenceNumber IS NOT NULL')
      .orderBy('audit.sequenceNumber', 'ASC')
      .take(effectiveLimit)
      .getMany();

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
    const queryBuilder = this.auditRepository.createQueryBuilder('audit');

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
