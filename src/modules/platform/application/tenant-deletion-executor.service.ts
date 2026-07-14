import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { RefreshToken } from '../../auth/domain/entities/refresh-token.entity';
import { User } from '../../users/domain/entities/user.entity';
import { Tenant } from '../../tenants/domain/entities/tenant.entity';
import { TenantStatus } from '../../tenants/domain/enums/tenant-status.enum';
import { PlatformAction } from '../domain/enums/platform-action.enum';
import { TenantLifecycleEvent } from '../domain/entities/tenant-lifecycle-event.entity';
import { PlatformAuditService } from './platform-audit.service';
import { TenantPurgeService } from './tenant-purge.service';

const SYSTEM_OPERATOR_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class TenantDeletionExecutorService {
  private readonly logger = new Logger(TenantDeletionExecutorService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantLifecycleEvent)
    private readonly lifecycleEventRepository: Repository<TenantLifecycleEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly purgeService: TenantPurgeService,
    private readonly auditService: PlatformAuditService,
    private readonly cacheUtils: CacheUtilsService,
    private readonly distributedLockService: DistributedLockService,
  ) {}

  async executeScheduledDeletion(tenantId: string, triggeredBy: string, ipAddress = 'system'): Promise<boolean> {
    const executed = await this.distributedLockService.withLock(
      `tenant-deletion:${tenantId}`,
      () => this.runScheduledDeletion(tenantId, triggeredBy, ipAddress),
      { ttl: 300_000, maxRetries: 0 },
    );

    return executed ?? false;
  }

  private async runScheduledDeletion(tenantId: string, triggeredBy: string, ipAddress: string): Promise<boolean> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      return false;
    }

    if (tenant.status !== TenantStatus.PENDING_DELETION) {
      return false;
    }

    if (!tenant.deletionScheduledAt || tenant.deletionScheduledAt.getTime() > Date.now()) {
      return false;
    }

    const snapshot = {
      status: tenant.status,
      name: tenant.name,
      slug: tenant.slug,
      deletionScheduledAt: tenant.deletionScheduledAt,
    };

    const platformUserId = triggeredBy === 'system' ? SYSTEM_OPERATOR_ID : triggeredBy;

    await this.revokeTenantSessions(tenantId);

    let purged = false;
    await this.dataSource.transaction(async (manager) => {
      const lockedTenant = await manager.findOne(Tenant, {
        where: { id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !lockedTenant ||
        lockedTenant.status !== TenantStatus.PENDING_DELETION ||
        !lockedTenant.deletionScheduledAt ||
        lockedTenant.deletionScheduledAt.getTime() > Date.now()
      ) {
        return;
      }

      await this.purgeService.purgeTenantData(tenantId, manager);
      purged = true;
    });

    if (!purged) {
      return false;
    }

    await this.recordLifecycleEvent({
      tenantId,
      eventType: 'tenant.deleted',
      triggeredBy: triggeredBy === 'system' ? null : triggeredBy,
      triggeredByType: triggeredBy === 'system' ? 'system' : 'platform_user',
      reason: 'Scheduled tenant deletion executed',
      previousState: snapshot,
      newState: null,
    });

    await this.auditService.log({
      platformUserId,
      targetTenantId: tenantId,
      action: PlatformAction.TENANT_DELETED,
      targetEntityType: 'tenant',
      targetEntityId: tenantId,
      reason: 'Scheduled tenant deletion executed',
      ipAddress,
      additionalContext: { operation: 'execute_scheduled_deletion' },
    });

    await this.cacheUtils.del(`tenant:state:${tenantId}`);

    this.logger.warn(`Tenant deletion executed: ${tenantId} (${tenant.slug})`);
    return true;
  }

  private async recordLifecycleEvent(params: {
    tenantId: string;
    eventType: string;
    triggeredBy: string | null;
    triggeredByType: 'platform_user' | 'system' | 'tenant_user';
    reason?: string | null;
    previousState?: Record<string, unknown> | null;
    newState?: Record<string, unknown> | null;
  }): Promise<void> {
    const event = this.lifecycleEventRepository.create({
      tenantId: params.tenantId,
      eventType: params.eventType,
      triggeredBy: params.triggeredBy,
      triggeredByType: params.triggeredByType,
      reason: params.reason ?? null,
      previousState: params.previousState ?? null,
      newState: params.newState ?? null,
    });
    await this.lifecycleEventRepository.save(event);
  }

  private async revokeTenantSessions(tenantId: string): Promise<void> {
    const users = await this.userRepository
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .where('u.tenantId = :tenantId', { tenantId })
      .getRawMany<{ id: string }>();

    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) {
      return;
    }

    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ isRevoked: true })
      .where('user_id IN (:...userIds)', { userIds })
      .andWhere('is_revoked = false')
      .execute();
  }
}
