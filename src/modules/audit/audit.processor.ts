import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Data structure for audit log queue job payload.
 */
interface AuditLogJobData {
  tenantId: string;
  action: string;
  entityName?: string;
  entityId?: string;
  userId?: string;
  oldValues?: unknown;
  newValues?: unknown;
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
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {
    super();
  }

  async process(job: Job<AuditLogJobData, void, string>): Promise<void> {
    if (job.name === 'log') {
      return this.handleLog(job.data);
    }
  }

  private async handleLog(data: AuditLogJobData): Promise<void> {
    try {
      const { tenantId, ...logData } = data;

      // Find last log for sequence and hash chaining
      const lastLog = await this.auditRepository.findOne({
        where: { tenantId },
        order: { sequenceNumber: 'DESC' },
        select: ['hash', 'sequenceNumber'],
      });

      const entry = this.auditRepository.create({
        ...logData,
        tenantId,
        previousHash: lastLog?.hash ?? undefined,
        sequenceNumber: (lastLog?.sequenceNumber ?? 0) + 1,
      });

      entry.createdAt = new Date();
      entry.hash = entry.calculateHash();

      await this.auditRepository.save(entry);
    } catch (error) {
      this.logger.error(
        `Failed to process audit log job ${data.action}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error; // Retry mechanism will kick in
    }
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
        this.logger.error(
          `Failed to store audit job to DLQ: ${dlqError instanceof Error ? dlqError.message : String(dlqError)}`,
        );
      }
    }
  }

  /**
   * Store failed audit log to dead letter queue for later processing.
   * This ensures audit logs are never silently lost.
   */
  private async storeToDLQ(data: AuditLogJobData, error: Error): Promise<void> {
    // Create a special audit entry marking this as a failed DLQ item
    const dlqEntry = this.auditRepository.create({
      tenantId: data.tenantId,
      action: `DLQ_FAILED:${data.action}`,
      entityName: data.entityName,
      entityId: data.entityId,
      userId: data.userId,
      notes: `FAILED_JOB: ${error.message}. Original data: ${JSON.stringify(data).slice(0, 1000)}`,
      sequenceNumber: -1, // Negative sequence indicates DLQ entry
    });

    dlqEntry.createdAt = new Date();
    dlqEntry.hash = dlqEntry.calculateHash();

    await this.auditRepository.save(dlqEntry);
    this.logger.warn(`Stored failed audit log to DLQ: ${data.action}`);
  }
}
