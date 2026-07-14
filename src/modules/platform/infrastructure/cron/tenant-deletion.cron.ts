import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DistributedLockService } from '../../../../common/services/distributed-lock.service';
import { toErrorMessage } from '../../../../common/utils/error.util';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { TenantStatus } from '../../../tenants/domain/enums/tenant-status.enum';
import { TenantDeletionExecutorService } from '../../application/tenant-deletion-executor.service';

const BATCH_LIMIT = 10;

@Injectable()
export class TenantDeletionCron {
  private readonly logger = new Logger(TenantDeletionCron.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly executorService: TenantDeletionExecutorService,
    private readonly distributedLockService: DistributedLockService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processDueDeletions(): Promise<void> {
    const result = await this.distributedLockService.withLock('tenant-deletion-cron', async () => this.processBatch(), {
      ttl: 300_000,
    });

    if (result === null) {
      this.logger.debug('Skipping tenant deletion cron: another instance holds the lock');
    }
  }

  async processBatch(): Promise<{ processed: number }> {
    const dueTenants = await this.tenantRepository
      .createQueryBuilder('tenant')
      .where('tenant.status = :status', { status: TenantStatus.PENDING_DELETION })
      .andWhere('tenant.deletion_scheduled_at IS NOT NULL')
      .andWhere('tenant.deletion_scheduled_at <= NOW()')
      .orderBy('tenant.deletion_scheduled_at', 'ASC')
      .limit(BATCH_LIMIT)
      .getMany();

    let processed = 0;

    for (const tenant of dueTenants) {
      try {
        const executed = await this.executorService.executeScheduledDeletion(tenant.id, 'system');
        if (executed) {
          processed += 1;
        }
      } catch (error: unknown) {
        this.logger.error(`Failed to execute scheduled deletion for tenant ${tenant.id}: ${toErrorMessage(error)}`);
      }
    }

    if (processed > 0) {
      this.logger.warn(`Tenant deletion cron processed ${processed} tenant(s)`);
    }

    return { processed };
  }
}
