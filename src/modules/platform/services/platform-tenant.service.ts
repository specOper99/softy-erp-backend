import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import {
  CreateTenantDto,
  DeleteTenantDto,
  ListTenantsDto,
  ReactivateTenantDto,
  SuspendTenantDto,
  UpdateTenantDto,
} from '../dto/tenant-management.dto';
import { TenantLifecycleEvent } from '../entities/tenant-lifecycle-event.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';

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

/**
 * Service for managing tenants from the platform console
 */
@Injectable()
export class PlatformTenantService {
  private readonly logger = new Logger(PlatformTenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantLifecycleEvent)
    private readonly lifecycleEventRepository: Repository<TenantLifecycleEvent>,
    private readonly auditService: PlatformAuditService,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  private async invalidateTenantStateCache(tenantId: string): Promise<void> {
    await this.cacheUtils.del(`tenant:state:${tenantId}`);
  }

  /**
   * List tenants with filtering and pagination
   */
  async listTenants(dto: ListTenantsDto): Promise<{ tenants: Tenant[]; total: number }> {
    const qb = this.tenantRepository.createQueryBuilder('tenant');

    if (dto.search) {
      qb.andWhere('(tenant.name ILIKE :search OR tenant.slug ILIKE :search OR tenant.billingEmail ILIKE :search)', {
        search: `%${dto.search}%`,
      });
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

  /**
   * Get detailed tenant information
   */
  async getTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    return tenant;
  }

  /**
   * Create a new tenant
   */
  async createTenant(dto: CreateTenantDto, platformUserId: string, ipAddress: string): Promise<Tenant> {
    // Check if slug is already taken
    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Tenant slug '${dto.slug}' is already taken`);
    }

    const tenant = this.tenantRepository.create({
      name: dto.name,
      slug: dto.slug,
      subscriptionPlan: dto.subscriptionPlan,
      billingEmail: dto.billingEmail,
      status: TenantStatus.ACTIVE,
      lastActivityAt: new Date(),
    });

    const saved = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(saved.id);

    // Log lifecycle event
    await this.lifecycleEventRepository.save({
      tenantId: saved.id,
      eventType: 'CREATED',
      triggeredBy: platformUserId,
      triggeredByType: 'platform_user',
      newState: { name: saved.name, slug: saved.slug },
    });

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_CREATED,
      targetTenantId: saved.id,
      ipAddress,
      changesAfter: { id: saved.id, name: saved.name, slug: saved.slug },
    });

    this.logger.log(`Tenant created: ${saved.id} (${saved.slug})`);

    return saved;
  }

  /**
   * Update tenant details
   */
  async updateTenant(
    tenantId: string,
    dto: UpdateTenantDto,
    platformUserId: string,
    ipAddress: string,
    reason: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const before = { ...tenant };

    Object.assign(tenant, dto);

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);
    await this.invalidateTenantStateCache(updated.id);

    // Log lifecycle event
    await this.lifecycleEventRepository.save({
      tenantId: updated.id,
      eventType: 'UPDATED',
      triggeredBy: platformUserId,
      triggeredByType: 'platform_user',
      reason,
      previousState: before,
      newState: { ...dto },
    });

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_UPDATED,
      targetTenantId: updated.id,
      ipAddress,
      reason,
      changesBefore: before,
      changesAfter: { ...dto },
    });

    return updated;
  }

  /**
   * Suspend a tenant
   */
  async suspendTenant(
    tenantId: string,
    dto: SuspendTenantDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ConflictException('Tenant is already suspended');
    }

    const before = { status: tenant.status };

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

    // Log lifecycle event
    await this.lifecycleEventRepository.save({
      tenantId: updated.id,
      eventType: 'SUSPENDED',
      triggeredBy: platformUserId,
      triggeredByType: 'platform_user',
      reason: dto.reason,
      previousState: before,
      newState: { status: updated.status, suspendedAt: updated.suspendedAt },
    });

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_SUSPENDED,
      targetTenantId: updated.id,
      ipAddress,
      reason: dto.reason,
      changesBefore: before,
      changesAfter: { status: updated.status },
    });

    this.logger.warn(`Tenant suspended: ${updated.id} (${updated.slug}) - ${dto.reason}`);

    return updated;
  }

  /**
   * Reactivate a suspended tenant
   */
  async reactivateTenant(
    tenantId: string,
    dto: ReactivateTenantDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status === TenantStatus.ACTIVE) {
      throw new ConflictException('Tenant is already active');
    }

    const before = { status: tenant.status };

    tenant.status = TenantStatus.ACTIVE;
    tenant.suspendedAt = null;
    tenant.suspendedBy = null;
    tenant.suspensionReason = null;
    tenant.gracePeriodEndsAt = null;
    tenant.lastActivityAt = new Date();

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    // Log lifecycle event
    await this.lifecycleEventRepository.save({
      tenantId: updated.id,
      eventType: 'REACTIVATED',
      triggeredBy: platformUserId,
      triggeredByType: 'platform_user',
      reason: dto.reason,
      previousState: before,
      newState: { status: updated.status },
    });

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_REACTIVATED,
      targetTenantId: updated.id,
      ipAddress,
      reason: dto.reason,
      changesBefore: before,
      changesAfter: { status: updated.status },
    });

    this.logger.log(`Tenant reactivated: ${updated.id} (${updated.slug}) - ${dto.reason}`);

    return updated;
  }

  /**
   * Lock a tenant (emergency security action)
   */
  async lockTenant(tenantId: string, reason: string, platformUserId: string, ipAddress: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const before = { status: tenant.status };

    tenant.status = TenantStatus.LOCKED;

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    // Log lifecycle event
    await this.lifecycleEventRepository.save({
      tenantId: updated.id,
      eventType: 'LOCKED',
      triggeredBy: platformUserId,
      triggeredByType: 'platform_user',
      reason,
      previousState: before,
      newState: { status: updated.status },
    });

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_LOCKED,
      targetTenantId: updated.id,
      ipAddress,
      reason,
      changesBefore: before,
      changesAfter: { status: updated.status },
    });

    this.logger.warn(`Tenant LOCKED: ${updated.id} (${updated.slug}) - ${reason}`);

    return updated;
  }

  /**
   * Schedule tenant deletion (soft delete with grace period)
   */
  async deleteTenant(
    tenantId: string,
    dto: DeleteTenantDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);
    const before = { status: tenant.status };

    tenant.status = TenantStatus.PENDING_DELETION;

    if (dto.scheduleFor) {
      tenant.deletionScheduledAt = new Date(dto.scheduleFor);
    } else {
      // Default: 30 days from now
      tenant.deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const updated = await this.tenantRepository.save(tenant);

    // Log lifecycle event
    await this.lifecycleEventRepository.save({
      tenantId: updated.id,
      eventType: 'DELETION_SCHEDULED',
      triggeredBy: platformUserId,
      triggeredByType: 'platform_user',
      reason: dto.reason,
      previousState: before,
      newState: {
        status: updated.status,
        deletionScheduledAt: updated.deletionScheduledAt,
      },
    });

    // Audit log
    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TENANT_DELETED,
      targetTenantId: updated.id,
      ipAddress,
      reason: dto.reason,
      changesBefore: before,
      changesAfter: {
        status: updated.status,
        deletionScheduledAt: updated.deletionScheduledAt,
      },
    });

    this.logger.warn(
      `Tenant deletion scheduled: ${updated.id} (${updated.slug}) for ${String(updated.deletionScheduledAt)}`,
    );

    return updated;
  }

  /**
   * Get tenant metrics
   */
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

  /**
   * Get tenant lifecycle timeline
   */
  async getTenantTimeline(tenantId: string): Promise<TenantLifecycleEvent[]> {
    return this.lifecycleEventRepository.find({
      where: { tenantId },
      order: { occurredAt: 'DESC' },
      take: 100,
    });
  }
}
