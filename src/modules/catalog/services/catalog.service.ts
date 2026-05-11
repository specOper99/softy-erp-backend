import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { createPaginatedResponse, PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { applyIlikeSearch } from '../../../common/utils/ilike-escape.util';
import { AuditPublisher } from '../../audit/audit.publisher';
import { ClonePackageDto, CreateServicePackageDto, PackageFilterDto, UpdateServicePackageDto } from '../dto';
import { ServicePackage } from '../entities/service-package.entity';
import { ServicePackageRepository } from '../repositories/service-package.repository';

@Injectable()
export class CatalogService {
  constructor(
    private readonly packageRepository: ServicePackageRepository,
    private readonly auditService: AuditPublisher,
    private readonly cacheUtils: CacheUtilsService,
    private readonly availabilityCacheOwner: AvailabilityCacheOwnerService,
  ) {}

  // Cache TTLs in milliseconds
  private readonly PACKAGES_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  private getPackagesCacheKey(tenantId: string): string {
    return `catalog:packages:${tenantId}`;
  }

  private async invalidatePackagesCache(tenantId: string): Promise<void> {
    await this.cacheUtils.del(this.getPackagesCacheKey(tenantId));
  }

  // Service Package Methods
  async createPackage(dto: CreateServicePackageDto): Promise<ServicePackage> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // Validate price is positive
    if (dto.price !== undefined && dto.price <= 0) {
      throw new BadRequestException('catalog.price_must_be_positive');
    }

    if (dto.requiredStaffCount !== undefined && dto.requiredStaffCount < 1) {
      throw new BadRequestException('catalog.required_staff_count_must_be_at_least_one');
    }

    const pkg = this.packageRepository.create({ ...dto });
    const savedPkg = await this.packageRepository.save(pkg);

    await this.auditService.log({
      action: 'CREATE',
      entityName: 'ServicePackage',
      entityId: savedPkg.id,
      newValues: { name: savedPkg.name, price: savedPkg.price },
    });

    // Invalidate cache
    await this.invalidatePackagesCache(tenantId);

    return savedPkg;
  }

  async findAllPackages(query: PaginationDto = new PaginationDto(), nocache = false): Promise<ServicePackage[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const cacheKey = this.getPackagesCacheKey(tenantId);

    // Try cache first (only for default pagination to avoid cache explosion)
    if (!nocache && query.page === 1 && query.limit === 10) {
      const cached = await this.cacheUtils.get<ServicePackage[]>(cacheKey);
      if (cached) return cached;
    }

    const packages = await this.packageRepository
      .createQueryBuilder('pkg')
      .skip(query.getSkip())
      .take(query.getTake())
      .getMany();

    // Cache only default pagination
    if (!nocache && query.page === 1 && query.limit === 10) {
      await this.cacheUtils.set(cacheKey, packages, this.PACKAGES_CACHE_TTL);
    }

    return packages;
  }

  async findAllPackagesWithFilters(filter: PackageFilterDto): Promise<PaginatedResponseDto<ServicePackage>> {
    const qb = this.packageRepository.createQueryBuilder('pkg');

    // Apply filters
    this.applyPackageFilters(qb, filter);

    // Get total count
    const total = await qb.getCount();

    // Apply pagination
    qb.skip(filter.getSkip()).take(filter.getTake());

    // Order by
    qb.orderBy('pkg.isActive', 'DESC').addOrderBy('pkg.name', 'ASC');

    const data = await qb.getMany();

    return createPaginatedResponse(data, total, filter.page || 1, filter.getTake());
  }

  async findAllPackagesWithFiltersCursor(
    filter: PackageFilterDto,
  ): Promise<{ data: ServicePackage[]; nextCursor: string | null }> {
    const qb = this.packageRepository.createQueryBuilder('pkg');

    // Apply cursor pagination with filters
    return CursorPaginationHelper.paginate(qb, {
      cursor: filter.cursor,
      limit: filter.limit,
      alias: 'pkg',
      filters: (qb) => this.applyPackageFilters(qb, filter),
    });
  }

  private applyPackageFilters(qb: SelectQueryBuilder<ServicePackage>, filter: PackageFilterDto): void {
    if (filter.isActive !== undefined) {
      qb.andWhere('pkg.isActive = :isActive', { isActive: filter.isActive });
    }

    if (filter.search) {
      applyIlikeSearch(qb, ['pkg.name', 'pkg.description'], filter.search);
    }

    if (filter.minPrice !== undefined) {
      qb.andWhere('pkg.price >= :minPrice', { minPrice: filter.minPrice });
    }

    if (filter.maxPrice !== undefined) {
      qb.andWhere('pkg.price <= :maxPrice', { maxPrice: filter.maxPrice });
    }
  }

  async findAllPackagesCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: ServicePackage[]; nextCursor: string | null }> {
    const limit = query.limit || 20;

    const qb = this.packageRepository.createQueryBuilder('pkg');

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit,
      alias: 'pkg',
    });
  }

  async findPackageById(id: string): Promise<ServicePackage> {
    const pkg = await this.packageRepository.createQueryBuilder('pkg').where('pkg.id = :id', { id }).getOne();
    if (!pkg) {
      throw new NotFoundException({
        code: 'catalog.service_package_not_found',
        args: { id },
      });
    }
    return pkg;
  }

  async updatePackage(id: string, dto: UpdateServicePackageDto): Promise<ServicePackage> {
    const pkg = await this.findPackageById(id);
    const oldValues = {
      name: pkg.name,
      price: pkg.price,
      isActive: pkg.isActive,
      durationMinutes: pkg.durationMinutes,
      requiredStaffCount: pkg.requiredStaffCount,
    };

    if (dto.price !== undefined && dto.price <= 0) {
      throw new BadRequestException('catalog.price_must_be_positive');
    }

    if (dto.requiredStaffCount !== undefined && dto.requiredStaffCount < 1) {
      throw new BadRequestException('catalog.required_staff_count_must_be_at_least_one');
    }

    if (dto.name !== undefined) pkg.name = dto.name;
    if (dto.description !== undefined) pkg.description = dto.description;
    if (dto.price !== undefined) pkg.price = dto.price;
    if (dto.isActive !== undefined) pkg.isActive = dto.isActive;
    if (dto.durationMinutes !== undefined) pkg.durationMinutes = dto.durationMinutes;
    if (dto.requiredStaffCount !== undefined) pkg.requiredStaffCount = dto.requiredStaffCount;
    if (dto.revenueAccountCode !== undefined) pkg.revenueAccountCode = dto.revenueAccountCode;
    const savedPkg = await this.packageRepository.save(pkg);

    // Log price or status changes
    if (dto.price !== undefined || dto.isActive !== undefined || dto.name !== undefined) {
      await this.auditService.log({
        action: 'UPDATE',
        entityName: 'ServicePackage',
        entityId: id,
        oldValues,
        newValues: {
          name: savedPkg.name,
          price: savedPkg.price,
          isActive: savedPkg.isActive,
        },
        notes:
          dto.price !== undefined && dto.price !== oldValues.price
            ? `Price changed from ${oldValues.price} to ${savedPkg.price}`
            : undefined,
      });
    }

    // Invalidate caches
    const tenantId = TenantContextService.getTenantIdOrThrow();
    await this.invalidatePackagesCache(tenantId);

    // Invalidate availability cache when staffing-affecting fields change
    const availabilityAffected =
      dto.isActive !== undefined || dto.durationMinutes !== undefined || dto.requiredStaffCount !== undefined;
    if (availabilityAffected) {
      await this.availabilityCacheOwner.delAvailabilityForPackage(tenantId, id);
    }

    return savedPkg;
  }

  async deletePackage(id: string): Promise<void> {
    const pkg = await this.findPackageById(id);

    try {
      await this.packageRepository.remove(pkg);
    } catch (error) {
      const dbError = error as { code?: string; driverError?: { code?: string } };
      const errorCode = dbError.code ?? dbError.driverError?.code;

      if (errorCode === '23503') {
        throw new ConflictException('catalog.package_in_use');
      }

      throw error;
    }

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'ServicePackage',
      entityId: id,
      oldValues: { name: pkg.name, price: pkg.price },
    });

    // Invalidate both package list and availability caches
    const tenantId = TenantContextService.getTenantIdOrThrow();
    await this.invalidatePackagesCache(tenantId);
    await this.availabilityCacheOwner.delAvailabilityForPackage(tenantId, id);
  }

  async clonePackage(packageId: string, dto: ClonePackageDto): Promise<ServicePackage> {
    const sourcePackage = await this.findPackageById(packageId);

    if (!sourcePackage) {
      throw new NotFoundException({
        code: 'catalog.service_package_not_found',
        args: { id: packageId },
      });
    }

    const newPackage = this.packageRepository.create({
      name: dto.newName,
      description: dto.description ?? sourcePackage.description,
      price: dto.newPrice ?? sourcePackage.price,
      durationMinutes: sourcePackage.durationMinutes,
      requiredStaffCount: sourcePackage.requiredStaffCount,
      revenueAccountCode: sourcePackage.revenueAccountCode,
      isActive: true,
      isTemplate: false,
      templateCategory: null,
    });

    const savedPackage = await this.packageRepository.save(newPackage);

    await this.auditService.log({
      action: 'CLONE',
      entityName: 'ServicePackage',
      entityId: savedPackage.id,
      newValues: {
        name: savedPackage.name,
        price: savedPackage.price,
        clonedFrom: sourcePackage.id,
      },
      notes: `Cloned from package "${sourcePackage.name}" (${sourcePackage.id})`,
    });

    const tenantId = TenantContextService.getTenantIdOrThrow();
    await this.invalidatePackagesCache(tenantId);

    return this.findPackageById(savedPackage.id);
  }
}
