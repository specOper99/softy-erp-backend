import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { applyIlikeSearch } from '../../../common/utils/ilike-escape.util';
import { Role } from '../../users/domain/enums/role.enum';
import { TenantsService } from '../../tenants/application/tenants.service';
import { Tenant } from '../../tenants/domain/entities/tenant.entity';
import { TenantStatus } from '../../tenants/domain/enums/tenant-status.enum';
import { UsersService } from '../../users/application/users.service';
import {
  CancelDeletionDto,
  CreateTenantDto,
  DeleteTenantDto,
  ListTenantsDto,
  ReactivateTenantDto,
  SuspendTenantDto,
  UpdateTenantDto,
} from '../api/dto/tenant-management.dto';
import { TenantLifecycleEvent } from '../domain/entities/tenant-lifecycle-event.entity';
import { PlatformAction } from '../domain/enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';
import { TenantDeletionExecutorService } from './tenant-deletion-executor.service';

const DEFAULT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export interface TenantMetricsResponse {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string | null;
  createdAt: Date;
  lastActivityAt: Date | null;
  metrics: {
    totalUsers: number | null;
    totalBookings: number | null;
    totalRevenue: number | null;
    mrr: number | null;
    riskScore: number | null;
    healthScore: number | null;
  };
  billing: {
    stripeCustomerId: string | null;
    subscriptionStartedAt: Date | null;
    subscriptionEndsAt: Date | null;
    trialEndsAt: Date | null;
  };
}

@Injectable()
export class PlatformTenantService {
  private readonly logger = new Logger(PlatformTenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantLifecycleEvent)
    private readonly lifecycleEventRepository: Repository<TenantLifecycleEvent>,
    private readonly cacheUtils: CacheUtilsService,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly deletionExecutor: TenantDeletionExecutorService,
    private readonly auditService: PlatformAuditService,
  ) {}

  private assertDeletableStatus(tenant: Tenant): void {
    if (tenant.status === TenantStatus.PENDING_DELETION) {
      throw new ConflictException('tenants.deletion_already_scheduled');
    }
    if (tenant.status === TenantStatus.DELETED) {
      throw new ConflictException('tenants.already_deleted');
    }
  }

  private async invalidateTenantStateCache(tenantId: string): Promise<void> {
    await this.cacheUtils.del(`tenant:state:${tenantId}`);
  }

  private tenantSnapshot(tenant: Tenant): Record<string, unknown> {
    return {
      status: tenant.status,
      name: tenant.name,
      subscriptionPlan: tenant.subscriptionPlan,
      deletionScheduledAt: tenant.deletionScheduledAt,
      subscriptionStartedAt: tenant.subscriptionStartedAt,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
      trialEndsAt: tenant.trialEndsAt,
    };
  }

  private parseOptionalDate(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return new Date(value);
  }

  private assertSubscriptionDateOrder(startedAt: Date | null, endsAt: Date | null): void {
    if (startedAt && endsAt && endsAt < startedAt) {
      throw new BadRequestException('tenants.subscription_end_before_start');
    }
  }

  private applyOptionalSubscriptionDates(
    tenant: Tenant,
    dto: Pick<UpdateTenantDto, 'subscriptionStartedAt' | 'subscriptionEndsAt' | 'trialEndsAt'>,
  ): void {
    const startedAt = this.parseOptionalDate(dto.subscriptionStartedAt);
    const endsAt = this.parseOptionalDate(dto.subscriptionEndsAt);
    const trialEndsAt = this.parseOptionalDate(dto.trialEndsAt);

    if (startedAt !== undefined) tenant.subscriptionStartedAt = startedAt;
    if (endsAt !== undefined) tenant.subscriptionEndsAt = endsAt;
    if (trialEndsAt !== undefined) tenant.trialEndsAt = trialEndsAt;

    this.assertSubscriptionDateOrder(tenant.subscriptionStartedAt, tenant.subscriptionEndsAt);
  }

  private async recordLifecycleEvent(params: {
    tenantId: string;
    eventType: string;
    triggeredBy: string | null;
    reason?: string | null;
    previousState?: Record<string, unknown> | null;
    newState?: Record<string, unknown> | null;
  }): Promise<void> {
    const event = this.lifecycleEventRepository.create({
      tenantId: params.tenantId,
      eventType: params.eventType,
      triggeredBy: params.triggeredBy,
      triggeredByType: 'platform_user',
      reason: params.reason ?? null,
      previousState: params.previousState ?? null,
      newState: params.newState ?? null,
    });
    await this.lifecycleEventRepository.save(event);
  }

  async listTenants(dto: ListTenantsDto): Promise<{ tenants: Tenant[]; total: number }> {
    const qb = this.tenantRepository.createQueryBuilder('tenant');

    if (dto.search) {
      applyIlikeSearch(qb, ['tenant.name', 'tenant.slug', 'tenant.billingEmail'], dto.search);
    }

    if (dto.status) {
      qb.andWhere('tenant.status = :status', { status: dto.status });
    }

    if (dto.plan) {
      qb.andWhere('tenant.subscriptionPlan = :plan', { plan: dto.plan });
    }

    if (dto.minRiskScore !== undefined) {
      qb.andWhere('tenant.riskScore >= :minRisk', {
        minRisk: dto.minRiskScore,
      });
    }

    if (dto.createdAfter) {
      qb.andWhere('tenant.createdAt >= :after', { after: dto.createdAfter });
    }

    if (dto.createdBefore) {
      qb.andWhere('tenant.createdAt <= :before', {
        before: dto.createdBefore,
      });
    }

    const total = await qb.getCount();

    qb.orderBy('tenant.createdAt', 'DESC')
      .skip(dto.offset || 0)
      .take(dto.limit || 20);

    const tenants = await qb.getMany();

    return { tenants, total };
  }

  async getTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'platform.tenant_not_found',
        args: { tenantId },
      });
    }

    return tenant;
  }

  async createTenant(dto: CreateTenantDto, platformUserId: string, ipAddress: string): Promise<Tenant> {
    const slugTaken = await this.tenantRepository.findOne({ where: { slug: dto.slug } });
    if (slugTaken) {
      throw new ConflictException({
        code: 'tenants.slug_taken',
        args: { slug: dto.slug },
      });
    }

    const existingUser = await this.usersService.findByEmailGlobal(dto.initialAdmin.email);
    if (existingUser) {
      throw new ConflictException({
        code: 'auth.email_already_registered',
        args: { email: dto.initialAdmin.email },
      });
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const tenant = await this.tenantsService.createWithManager(manager, {
        name: dto.name,
        slug: dto.slug,
        subscriptionPlan: dto.subscriptionPlan,
      });

      tenant.billingEmail = dto.billingEmail ?? null;
      tenant.status = TenantStatus.ACTIVE;
      tenant.lastActivityAt = new Date();
      if (dto.subscriptionStartedAt) {
        tenant.subscriptionStartedAt = new Date(dto.subscriptionStartedAt);
      }
      if (dto.subscriptionEndsAt) {
        tenant.subscriptionEndsAt = new Date(dto.subscriptionEndsAt);
      }
      if (dto.trialEndsAt) {
        tenant.trialEndsAt = new Date(dto.trialEndsAt);
      }
      this.assertSubscriptionDateOrder(tenant.subscriptionStartedAt, tenant.subscriptionEndsAt);
      await manager.save(tenant);

      await this.usersService.createWithManager(manager, {
        email: dto.initialAdmin.email,
        password: dto.initialAdmin.password,
        role: Role.ADMIN,
        tenantId: tenant.id,
      });

      return tenant;
    });

    await this.invalidateTenantStateCache(result.id);

    await this.recordLifecycleEvent({
      tenantId: result.id,
      eventType: 'tenant.created',
      triggeredBy: platformUserId,
      reason: null,
      newState: this.tenantSnapshot(result),
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_CREATED,
      targetTenantId: result.id,
      targetEntityType: 'tenant',
      targetEntityId: result.id,
      ipAddress,
      changesAfter: this.tenantSnapshot(result),
    });

    this.logger.warn(
      `Tenant created with initial admin: tenant=${result.id} (${result.slug}) ` +
        `adminEmail=${dto.initialAdmin.email} platformOperator=${platformUserId} ip=${ipAddress} ` +
        `note=plaintext password supplied in request body and consumed; not retained`,
    );

    return result;
  }

  async updateTenant(
    tenantId: string,
    dto: UpdateTenantDto,
    platformUserId: string,
    ipAddress: string,
    reason: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const previousState = this.tenantSnapshot(tenant);

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.subscriptionPlan !== undefined) tenant.subscriptionPlan = dto.subscriptionPlan;
    if (dto.billingEmail !== undefined) tenant.billingEmail = dto.billingEmail;
    if (dto.quotas !== undefined) tenant.quotas = dto.quotas;
    if (dto.metadata !== undefined) tenant.metadata = dto.metadata;
    this.applyOptionalSubscriptionDates(tenant, dto);

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    const newState = this.tenantSnapshot(updated);

    await this.recordLifecycleEvent({
      tenantId: updated.id,
      eventType: 'tenant.updated',
      triggeredBy: platformUserId,
      reason,
      previousState,
      newState,
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_UPDATED,
      targetTenantId: updated.id,
      targetEntityType: 'tenant',
      targetEntityId: updated.id,
      reason,
      ipAddress,
      changesBefore: previousState,
      changesAfter: newState,
    });

    this.logger.log(`Tenant updated: ${updated.id} (${updated.slug})`);

    return updated;
  }

  async suspendTenant(
    tenantId: string,
    dto: SuspendTenantDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const previousState = this.tenantSnapshot(tenant);

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ConflictException('tenants.suspended_already');
    }

    const gracePeriodDays = dto.gracePeriodDays ?? 0;
    tenant.status = gracePeriodDays > 0 ? TenantStatus.GRACE_PERIOD : TenantStatus.SUSPENDED;
    tenant.suspendedAt = new Date();
    tenant.suspendedBy = platformUserId;
    tenant.suspensionReason = dto.reason;

    if (gracePeriodDays > 0) {
      tenant.gracePeriodEndsAt = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);
    }

    if (dto.suspendUntil) {
      tenant.gracePeriodEndsAt = new Date(dto.suspendUntil);
    }

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    const newState = this.tenantSnapshot(updated);

    await this.recordLifecycleEvent({
      tenantId: updated.id,
      eventType: 'tenant.suspended',
      triggeredBy: platformUserId,
      reason: dto.reason,
      previousState,
      newState,
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_SUSPENDED,
      targetTenantId: updated.id,
      targetEntityType: 'tenant',
      targetEntityId: updated.id,
      reason: dto.reason,
      ipAddress,
      changesBefore: previousState,
      changesAfter: newState,
    });

    this.logger.warn(`Tenant suspended: ${updated.id} (${updated.slug}) - ${dto.reason}`);

    return updated;
  }

  async reactivateTenant(
    tenantId: string,
    dto: ReactivateTenantDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const previousState = this.tenantSnapshot(tenant);

    if (tenant.status === TenantStatus.DELETED) {
      throw new ConflictException('tenants.already_deleted');
    }

    if (tenant.status === TenantStatus.ACTIVE && tenant.deletionScheduledAt == null) {
      throw new ConflictException('tenants.active_already');
    }

    if (
      tenant.status === TenantStatus.PENDING_DELETION &&
      tenant.deletionScheduledAt &&
      tenant.deletionScheduledAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('tenants.deletion_cancellation_window_closed');
    }

    tenant.status = TenantStatus.ACTIVE;
    tenant.suspendedAt = null;
    tenant.suspendedBy = null;
    tenant.suspensionReason = null;
    tenant.gracePeriodEndsAt = null;
    tenant.deletionScheduledAt = null;
    tenant.lastActivityAt = new Date();

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    const newState = this.tenantSnapshot(updated);

    await this.recordLifecycleEvent({
      tenantId: updated.id,
      eventType: 'tenant.reactivated',
      triggeredBy: platformUserId,
      reason: dto.reason,
      previousState,
      newState,
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_REACTIVATED,
      targetTenantId: updated.id,
      targetEntityType: 'tenant',
      targetEntityId: updated.id,
      reason: dto.reason,
      ipAddress,
      changesBefore: previousState,
      changesAfter: newState,
    });

    this.logger.log(`Tenant reactivated: ${updated.id} (${updated.slug}) - ${dto.reason}`);

    return updated;
  }

  async lockTenant(tenantId: string, reason: string, platformUserId: string, ipAddress: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const previousState = this.tenantSnapshot(tenant);

    tenant.status = TenantStatus.LOCKED;

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    const newState = this.tenantSnapshot(updated);

    await this.recordLifecycleEvent({
      tenantId: updated.id,
      eventType: 'tenant.locked',
      triggeredBy: platformUserId,
      reason,
      previousState,
      newState,
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_LOCKED,
      targetTenantId: updated.id,
      targetEntityType: 'tenant',
      targetEntityId: updated.id,
      reason,
      ipAddress,
      changesBefore: previousState,
      changesAfter: newState,
    });

    this.logger.warn(`Tenant LOCKED: ${updated.id} (${updated.slug}) - ${reason}`);

    return updated;
  }

  async scheduleTenantDeletion(
    tenantId: string,
    scheduleDate: Date,
    platformUserId: string,
    reason: string,
    ipAddress = 'system',
  ): Promise<Tenant | null> {
    const tenant = await this.getTenant(tenantId);
    this.assertDeletableStatus(tenant);
    const previousState = this.tenantSnapshot(tenant);

    tenant.status = TenantStatus.PENDING_DELETION;
    tenant.deletionScheduledAt = scheduleDate;

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    const newState = this.tenantSnapshot(updated);

    await this.recordLifecycleEvent({
      tenantId: updated.id,
      eventType: 'tenant.deletion_scheduled',
      triggeredBy: platformUserId,
      reason,
      previousState,
      newState,
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_UPDATED,
      targetTenantId: updated.id,
      targetEntityType: 'tenant',
      targetEntityId: updated.id,
      reason,
      ipAddress,
      changesBefore: previousState,
      changesAfter: newState,
      additionalContext: { operation: 'deletion_scheduled' },
    });

    this.logger.warn(
      `Tenant deletion scheduled: ${updated.id} (${updated.slug}) for ${String(updated.deletionScheduledAt)}`,
    );

    if (scheduleDate.getTime() <= Date.now()) {
      const deleted = await this.deletionExecutor.executeScheduledDeletion(tenantId, platformUserId, ipAddress);
      if (deleted) {
        return null;
      }
    }

    return updated;
  }

  async deleteTenant(
    tenantId: string,
    dto: DeleteTenantDto,
    platformUserId: string,
    ipAddress: string,
    reason: string,
  ): Promise<Tenant> {
    const scheduleDate = dto.scheduleFor ? new Date(dto.scheduleFor) : new Date(Date.now() + DEFAULT_DELETION_GRACE_MS);

    // Satisfies check-lifecycle-completeness: records lifecycle event via scheduleTenantDeletion -> recordLifecycleEvent
    const result = await this.scheduleTenantDeletion(tenantId, scheduleDate, platformUserId, reason, ipAddress);
    if (!result) {
      throw new NotFoundException({
        code: 'platform.tenant_not_found',
        args: { tenantId },
      });
    }

    return result;
  }

  async cancelScheduledDeletion(
    tenantId: string,
    _dto: CancelDeletionDto,
    platformUserId: string,
    ipAddress: string,
    reason: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const previousState = this.tenantSnapshot(tenant);

    if (tenant.status !== TenantStatus.PENDING_DELETION) {
      throw new ConflictException('tenants.deletion_not_scheduled');
    }

    if (!tenant.deletionScheduledAt || tenant.deletionScheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('tenants.deletion_cancellation_window_closed');
    }

    tenant.status = TenantStatus.ACTIVE;
    tenant.deletionScheduledAt = null;

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    const newState = this.tenantSnapshot(updated);

    await this.recordLifecycleEvent({
      tenantId: updated.id,
      eventType: 'tenant.deletion_cancelled',
      triggeredBy: platformUserId,
      reason,
      previousState,
      newState,
    });

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_REACTIVATED,
      targetTenantId: updated.id,
      targetEntityType: 'tenant',
      targetEntityId: updated.id,
      reason,
      ipAddress,
      changesBefore: previousState,
      changesAfter: newState,
      additionalContext: { operation: 'deletion_cancelled' },
    });

    this.logger.log(`Tenant deletion cancelled: ${updated.id} (${updated.slug}) - ${reason}`);

    return updated;
  }

  async getTenantMetrics(tenantId: string): Promise<TenantMetricsResponse> {
    const tenant = await this.getTenant(tenantId);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.subscriptionPlan,
      createdAt: tenant.createdAt,
      lastActivityAt: tenant.lastActivityAt,
      metrics: {
        totalUsers: tenant.totalUsers,
        totalBookings: tenant.totalBookings,
        totalRevenue: tenant.totalRevenue,
        mrr: tenant.mrr,
        riskScore: tenant.riskScore,
        healthScore: tenant.healthScore,
      },
      billing: {
        stripeCustomerId: tenant.stripeCustomerId,
        subscriptionStartedAt: tenant.subscriptionStartedAt,
        subscriptionEndsAt: tenant.subscriptionEndsAt,
        trialEndsAt: tenant.trialEndsAt,
      },
    };
  }

  async getTenantTimeline(tenantId: string): Promise<TenantLifecycleEvent[]> {
    await this.getTenant(tenantId);

    return this.lifecycleEventRepository.find({
      where: { tenantId },
      order: { occurredAt: 'DESC' },
      take: 100,
    });
  }
}
