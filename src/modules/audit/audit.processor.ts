import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { toErrorMessage } from '../../common/utils/error.util';
import { AuditLog } from './entities/audit-log.entity';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { RuntimeFailure } from '../../common/errors/runtime-failure';

/**
 * Data structure for audit log queue job payload.
 */
interface AuditLogJobData {
  tenantId: string;
  action: string;
  entityName?: string;
  entityId?: string;
  userId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
}

@Processor('audit-queue')
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<AuditLogJobData, void, string>): Promise<void> {
    if (job.name === 'log') {
      const tenantId = typeof job.data.tenantId === 'string' ? job.data.tenantId.trim() : '';
      if (tenantId === '') {
        job.discard();
        throw new RuntimeFailure('Invalid audit job payload: tenantId is required');
      }

      return TenantContextService.run(tenantId, () => this.handleLog(job.data));
    }
  }

  private async handleLog(data: AuditLogJobData): Promise<void> {
    const { tenantId, ...logData } = data;

    await this.dataSource
      .transaction(async (manager) => {
        // Advisory lock scoped to this tenant prevents concurrent workers from
        // reading the same lastLog and computing duplicate sequenceNumbers.
        // hashtext() is a stable PostgreSQL function, so the lock is per-tenant.
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [tenantId]);

        const auditRepo = manager.getRepository(AuditLog);

        const lastLog = await auditRepo.findOne({
          where: { tenantId },
          order: { sequenceNumber: 'DESC' },
          select: ['hash', 'sequenceNumber'],
        });

        const entry = auditRepo.create({
          ...logData,
          tenantId,
          previousHash: lastLog?.hash ?? undefined,
          sequenceNumber: (lastLog?.sequenceNumber ?? 0) + 1,
        });

        entry.createdAt = new Date();
        entry.hash = entry.calculateHash();

        await auditRepo.save(entry);
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to process audit log job ${data.action}: ${toErrorMessage(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error; // Retry mechanism will kick in
      });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AuditLogJobData>, error: Error) {
    this.logger.error(`Audit log job ${job.id} failed: ${error.message}`, error.stack);

    // Check if job has exhausted all retries (DLQ scenario)
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      this.logger.warn(`Audit job ${job.id} exhausted all retries, saving to DLQ storage`);

      try {
        // Store failed job data for manual recovery
        // In production, this could write to a separate failed_audit_logs table
        // or send to an external DLQ like SQS/RabbitMQ
        await this.storeToDLQ(job.data, error);
      } catch (dlqError) {
        this.logger.error(`Failed to store audit job to DLQ: ${toErrorMessage(dlqError)}`);
      }
    }
  }

  /**
   * Store failed audit log to dead letter queue for later processing.
   * Writes to a special DLQ action prefix and uses sequenceNumber = null so
   * verifyChainIntegrity skips these entries — they are not part of the chain.
   */
  private async storeToDLQ(data: AuditLogJobData, error: Error): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const auditRepo = manager.getRepository(AuditLog);

      const dlqEntry = auditRepo.create({
        tenantId: data.tenantId,
        action: `DLQ_FAILED:${data.action}`,
        entityName: data.entityName ?? 'unknown',
        entityId: data.entityId ?? undefined,
        userId: data.userId,
        notes: `FAILED_JOB: ${error.message}. Original data: ${JSON.stringify(data).slice(0, 1000)}`,
        // Intentionally no sequenceNumber / previousHash — DLQ entries are NOT part of the integrity chain.
      });

      dlqEntry.createdAt = new Date();
      dlqEntry.hash = dlqEntry.calculateHash();

      await auditRepo.save(dlqEntry);
    });

    this.logger.warn(`Stored failed audit log to DLQ: ${data.action}`);
  }
}
