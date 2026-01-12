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
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Audit log job ${job.id} failed: ${error.message}`,
      error.stack,
    );
  }
}
