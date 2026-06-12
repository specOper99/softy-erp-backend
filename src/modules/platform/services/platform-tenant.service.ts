import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { applyIlikeSearch } from '../../../common/utils/ilike-escape.util';
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
  ) {}

  private async invalidateTenantStateCache(tenantId: string): Promise<void> {
    await this.cacheUtils.del(`tenant:state:${tenantId}`);
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

  async createTenant(dto: CreateTenantDto, _platformUserId: string, _ipAddress: string): Promise<Tenant> {
    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException({
        code: 'tenants.slug_taken',
        args: { slug: dto.slug },
      });
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

    this.logger.log(`Tenant created: ${saved.id} (${saved.slug})`);

    return saved;
  }

  async updateTenant(
    tenantId: string,
    dto: UpdateTenantDto,
    _platformUserId: string,
    _ipAddress: string,
    _reason: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.subscriptionPlan !== undefined) tenant.subscriptionPlan = dto.subscriptionPlan;
    if (dto.billingEmail !== undefined) tenant.billingEmail = dto.billingEmail;
    if (dto.quotas !== undefined) tenant.quotas = dto.quotas;
    if (dto.metadata !== undefined) tenant.metadata = dto.metadata;

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    this.logger.log(`Tenant updated: ${updated.id} (${updated.slug})`);

    return updated;
  }

  async suspendTenant(
    tenantId: string,
    dto: SuspendTenantDto,
    platformUserId: string,
    _ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

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

    this.logger.warn(`Tenant suspended: ${updated.id} (${updated.slug}) - ${dto.reason}`);

    return updated;
  }

  async reactivateTenant(
    tenantId: string,
    dto: ReactivateTenantDto,
    _platformUserId: string,
    _ipAddress: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status === TenantStatus.ACTIVE) {
      throw new ConflictException('tenants.active_already');
    }

    tenant.status = TenantStatus.ACTIVE;
    tenant.suspendedAt = null;
    tenant.suspendedBy = null;
    tenant.suspensionReason = null;
    tenant.gracePeriodEndsAt = null;
    tenant.lastActivityAt = new Date();

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    this.logger.log(`Tenant reactivated: ${updated.id} (${updated.slug}) - ${dto.reason}`);

    return updated;
  }

  async lockTenant(tenantId: string, reason: string, _platformUserId: string, _ipAddress: string): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    tenant.status = TenantStatus.LOCKED;

    const updated = await this.tenantRepository.save(tenant);
    await this.invalidateTenantStateCache(updated.id);

    this.logger.warn(`Tenant LOCKED: ${updated.id} (${updated.slug}) - ${reason}`);

    return updated;
  }

  async deleteTenant(
    tenantId: string,
    dto: DeleteTenantDto,
    _platformUserId: string,
    _ipAddress: string,
    _reason: string,
  ): Promise<Tenant> {
    const tenant = await this.getTenant(tenantId);

    tenant.status = TenantStatus.PENDING_DELETION;

    if (dto.scheduleFor) {
      tenant.deletionScheduledAt = new Date(dto.scheduleFor);
    } else {
      tenant.deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const updated = await this.tenantRepository.save(tenant);

    this.logger.warn(
      `Tenant deletion scheduled: ${updated.id} (${updated.slug}) for ${String(updated.deletionScheduledAt)}`,
    );

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
