import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Counter } from 'prom-client';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { FlagsService } from '../../common/flags/flags.service';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { StudioSettingsResponseDto, UpdateStudioSettingsDto, WorkingHoursDto } from './dto/studio-settings.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantStatus } from './enums/tenant-status.enum';

@Injectable()
export class TenantsService {
  private readonly portalTenantBlockedCounter: Counter<'tenantStatus' | 'enforced'>;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly flagsService: FlagsService,
    metricsFactory: MetricsFactory,
  ) {
    this.portalTenantBlockedCounter = metricsFactory.getOrCreateCounter({
      name: 'client_portal_tenant_blocked_total',
      help: 'Total client portal tenant status access blocks',
      labelNames: ['tenantStatus', 'enforced'],
    });
  }

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantRepository.create(createTenantDto);
    return this.tenantRepository.save(tenant);
  }

  async createWithManager(manager: EntityManager, createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = manager.create(Tenant, createTenantDto);
    return manager.save(tenant);
  }

  // PERFORMANCE: Added pagination to prevent unbounded query memory consumption
  async findAll(query: PaginationDto = new PaginationDto()): Promise<Tenant[]> {
    return this.tenantRepository.find({
      skip: query.getSkip(),
      take: query.getTake(),
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'tenants.not_found_by_id',
        args: { id },
      });
    }
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'tenants.not_found_by_slug',
        args: { slug },
      });
    }
    return tenant;
  }

  ensurePortalTenantAccessible(tenant: Tenant, context?: Record<string, string>): void {
    const enforceStrictPortalTenantStatus = this.flagsService.isEnabled(
      'strictPortalTenantStatus',
      { tenantId: tenant.id, tenantStatus: tenant.status, ...context },
      true,
    );

    if (tenant.status !== TenantStatus.ACTIVE) {
      this.portalTenantBlockedCounter.inc({
        tenantStatus: tenant.status,
        enforced: enforceStrictPortalTenantStatus ? 'true' : 'false',
      });
    }

    if (enforceStrictPortalTenantStatus && tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException('client-portal.tenant_blocked');
    }
  }

  async update(id: string, updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);
    const { parentTenantId, ...rest } = updateTenantDto;

    if (rest.name !== undefined) tenant.name = rest.name;
    if (rest.slug !== undefined) tenant.slug = rest.slug;
    if (rest.subscriptionPlan !== undefined) tenant.subscriptionPlan = rest.subscriptionPlan;

    if (parentTenantId) {
      // Efficiently set relation by ID without loading the whole entity
      tenant.parent = { id: parentTenantId } as Tenant;
    }

    return this.tenantRepository.save(tenant);
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantRepository.remove(tenant);
  }

  async getStudioSettings(tenantId: string): Promise<StudioSettingsResponseDto> {
    const tenant = await this.findOne(tenantId);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
      workingHours: (tenant.workingHours || undefined) as WorkingHoursDto[] | undefined,
      cancellationPolicy: tenant.cancellationPolicyDays,
      branding: tenant.branding || undefined,
      baseCurrency: tenant.baseCurrency,
      defaultTaxRate: Number(tenant.defaultTaxRate),
      description: tenant.description || undefined,
      address: tenant.address || undefined,
      phone: tenant.phone || undefined,
      email: tenant.email || undefined,
      website: tenant.website || undefined,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  async updateStudioSettings(tenantId: string, dto: UpdateStudioSettingsDto): Promise<StudioSettingsResponseDto> {
    const tenant = await this.findOne(tenantId);

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.timezone !== undefined) tenant.timezone = dto.timezone;
    if (dto.workingHours !== undefined) tenant.workingHours = dto.workingHours;
    if (dto.cancellationPolicy !== undefined) tenant.cancellationPolicyDays = dto.cancellationPolicy;
    if (dto.branding !== undefined) tenant.branding = dto.branding;
    if (dto.defaultTaxRate !== undefined) tenant.defaultTaxRate = dto.defaultTaxRate;
    if (dto.description !== undefined) tenant.description = dto.description;
    if (dto.address !== undefined) tenant.address = dto.address;
    if (dto.phone !== undefined) tenant.phone = dto.phone;
    if (dto.email !== undefined) tenant.email = dto.email;
    if (dto.website !== undefined) tenant.website = dto.website;
    if (dto.metadata !== undefined) tenant.metadata = { ...tenant.metadata, ...dto.metadata };

    await this.tenantRepository.save(tenant);
    return this.getStudioSettings(tenantId);
  }
}
