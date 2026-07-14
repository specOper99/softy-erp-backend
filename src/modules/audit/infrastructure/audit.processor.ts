import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { RuntimeFailure } from '../../../common/errors/runtime-failure';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { toErrorMessage } from '../../../common/utils/error.util';
import { AuditLog } from '../domain/entities';

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

type BullmqJob = Parameters<WorkerHost['process']>[0];

@Processor('audit-queue')
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: BullmqJob, _token?: string): Promise<void> {
    if (job.name === 'log') {
      const data = job.data as AuditLogJobData;
      const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : '';
      if (tenantId === '') {
        job.discard();
        throw new RuntimeFailure('Invalid audit job payload: tenantId is required');
      }

      return TenantContextService.run(tenantId, () => this.handleLog(data));
    }
  }

  private async handleLog(data: AuditLogJobData): Promise<void> {
    const { tenantId, ...logData } = data;

    await this.dataSource
      .transaction(async (manager) => {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [tenantId]);

        const lastLog = await manager.findOne(AuditLog, {
          where: { tenantId },
          order: { sequenceNumber: 'DESC' },
          select: ['hash', 'sequenceNumber'],
        });

        const entry = manager.create(AuditLog, {
          ...logData,
          tenantId,
          previousHash: lastLog?.hash ?? undefined,
          sequenceNumber: Number(lastLog?.sequenceNumber ?? 0) + 1,
        });

        entry.createdAt = new Date();
        entry.hash = entry.calculateHash();

        await manager.save(AuditLog, entry);
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
      const dlqEntry = manager.create(AuditLog, {
        tenantId: data.tenantId,
        action: `DLQ_FAILED:${data.action}`,
        entityName: data.entityName ?? 'unknown',
        entityId: data.entityId ?? undefined,
        userId: data.userId,
        notes: `FAILED_JOB: ${error.message}. Original data: ${JSON.stringify(data).slice(0, 1000)}`,
      });

      dlqEntry.createdAt = new Date();
      dlqEntry.hash = dlqEntry.calculateHash();

      await manager.save(AuditLog, dlqEntry);
    });

    this.logger.warn(`Stored failed audit log to DLQ: ${data.action}`);
  }
}
