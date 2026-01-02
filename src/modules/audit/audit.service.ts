import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit entry.
   * If manager is provided, it runs within that transaction.
   * Failures are caught and logged to prevent blocking the main business flow.
   */
  async log(
    data: {
      userId?: string;
      action: string;
      entityName: string;
      entityId: string;
      oldValues?: unknown;
      newValues?: unknown;
      notes?: string;
    },
    manager?: EntityManager,
  ): Promise<AuditLog | null> {
    try {
      const repo = manager
        ? manager.getRepository(AuditLog)
        : this.auditRepository;

      // Capture tenant context for scoped audit queries
      const tenantId = TenantContextService.getTenantId();

      const entry = repo.create({
        ...data,
        tenantId,
      });

      const savedEntry = await repo.save(entry);
      return savedEntry;
    } catch (error) {
      // Non-blocking error tracking (don't throw, just log)
      this.logger.error(
        `Failed to persist audit log: ${error instanceof Error ? error.message : String(error)}`,
        { auditData: data },
      );
      return null;
    }
  }
}
