import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { AuditPublisher } from '../../audit/audit.publisher';
import {
  AddPackageItemsDto,
  ClonePackageDto,
  CreateServicePackageDto,
  CreateTaskTypeDto,
  UpdateServicePackageDto,
  UpdateTaskTypeDto,
} from '../dto';
import { PackageItem } from '../entities/package-item.entity';
import { ServicePackage } from '../entities/service-package.entity';
import { TaskType } from '../entities/task-type.entity';
import { PackageItemRepository } from '../repositories/package-item.repository';
import { ServicePackageRepository } from '../repositories/service-package.repository';
import { TaskTypeRepository } from '../repositories/task-type.repository';

@Injectable()
export class CatalogService {
  constructor(
    private readonly packageRepository: ServicePackageRepository,
    private readonly taskTypeRepository: TaskTypeRepository,
    private readonly packageItemRepository: PackageItemRepository,
    private readonly auditService: AuditPublisher,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  // Cache TTLs in milliseconds
  private readonly PACKAGES_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private readonly TASK_TYPES_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  private getPackagesCacheKey(tenantId: string): string {
    return `catalog:packages:${tenantId}`;
  }

  private getTaskTypesCacheKey(tenantId: string): string {
    return `catalog:task-types:${tenantId}`;
  }

  private async invalidatePackagesCache(tenantId: string): Promise<void> {
    await this.cacheUtils.del(this.getPackagesCacheKey(tenantId));
  }

  private async invalidateTaskTypesCache(tenantId: string): Promise<void> {
    await this.cacheUtils.del(this.getTaskTypesCacheKey(tenantId));
  }

  // Service Package Methods
  async createPackage(dto: CreateServicePackageDto): Promise<ServicePackage> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // Validate price is positive
    if (dto.price !== undefined && dto.price <= 0) {
      throw new BadRequestException('catalog.price_must_be_positive');
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

    const packages = await this.packageRepository.find({
      where: {},
      relations: ['packageItems', 'packageItems.taskType'],
      skip: query.getSkip(),
      take: query.getTake(),
    });

    // Cache only default pagination
    if (!nocache && query.page === 1 && query.limit === 10) {
      await this.cacheUtils.set(cacheKey, packages, this.PACKAGES_CACHE_TTL);
    }

    return packages;
  }

  async findAllPackagesCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: ServicePackage[]; nextCursor: string | null }> {
    const limit = query.limit || 20;

    const qb = this.packageRepository.createQueryBuilder('pkg');
    const tenantId = TenantContextService.getTenantIdOrThrow();

    qb.leftJoinAndSelect('pkg.packageItems', 'items')
      .leftJoinAndSelect('items.taskType', 'taskType')
      .where('pkg.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit,
      alias: 'pkg',
    });
  }

  async findPackageById(id: string): Promise<ServicePackage> {
    const pkg = await this.packageRepository.findOne({
      where: { id },
      relations: ['packageItems', 'packageItems.taskType'],
    });
    if (!pkg) {
      throw new NotFoundException(`ServicePackage with ID ${id} not found`);
    }
    return pkg;
  }

  async updatePackage(id: string, dto: UpdateServicePackageDto): Promise<ServicePackage> {
    const pkg = await this.findPackageById(id);
    const oldValues = {
      name: pkg.name,
      price: pkg.price,
      isActive: pkg.isActive,
    };

    Object.assign(pkg, dto);
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

    // Invalidate cache
    await this.invalidatePackagesCache(TenantContextService.getTenantId() ?? 'default');

    return savedPkg;
  }

  async deletePackage(id: string): Promise<void> {
    const pkg = await this.findPackageById(id);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'ServicePackage',
      entityId: id,
      oldValues: { name: pkg.name, price: pkg.price },
    });

    await this.packageRepository.remove(pkg);

    // Invalidate cache
    await this.invalidatePackagesCache(TenantContextService.getTenantId() ?? 'default');
  }

  async addPackageItems(packageId: string, dto: AddPackageItemsDto): Promise<PackageItem[]> {
    await this.findPackageById(packageId);
    const items = dto.items.map((item) =>
      this.packageItemRepository.create({
        packageId,
        taskTypeId: item.taskTypeId,
        quantity: item.quantity,
      }),
    );
    const savedItems = await this.packageItemRepository.save(items);

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'ServicePackage',
      entityId: packageId,
      newValues: { addedItems: dto.items.length },
      notes: `Added ${dto.items.length} items to package.`,
    });

    return savedItems;
  }

  async removePackageItem(itemId: string): Promise<void> {
    const item = await this.packageItemRepository.findOne({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException(`PackageItem with ID ${itemId} not found`);
    }
    await this.packageItemRepository.remove(item);

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'ServicePackage',
      entityId: item.packageId,
      oldValues: { removedItemId: itemId },
      notes: `Removed item ${itemId} from package.`,
    });
  }

  // Task Type Methods
  async createTaskType(dto: CreateTaskTypeDto): Promise<TaskType> {
    const tenantId = TenantContextService.getTenantId();
    const taskType = this.taskTypeRepository.create({ ...dto });
    const savedTaskType = await this.taskTypeRepository.save(taskType);

    await this.auditService.log({
      action: 'CREATE',
      entityName: 'TaskType',
      entityId: savedTaskType.id,
      newValues: {
        name: savedTaskType.name,
        defaultCommissionAmount: savedTaskType.defaultCommissionAmount,
      },
    });

    // Invalidate cache
    await this.invalidateTaskTypesCache(tenantId ?? 'default');

    return savedTaskType;
  }

  async findAllTaskTypes(query: PaginationDto = new PaginationDto(), nocache = false): Promise<TaskType[]> {
    const tenantId = TenantContextService.getTenantId();
    const cacheKey = this.getTaskTypesCacheKey(tenantId ?? 'default');

    // Try cache first (only for default pagination)
    if (!nocache && query.page === 1 && query.limit === 10) {
      const cached = await this.cacheUtils.get<TaskType[]>(cacheKey);
      if (cached) return cached;
    }

    const taskTypes = await this.taskTypeRepository.find({
      where: {},
      skip: query.getSkip(),
      take: query.getTake(),
    });

    // Cache only default pagination
    if (!nocache && query.page === 1 && query.limit === 10 && tenantId) {
      await this.cacheUtils.set(cacheKey, taskTypes, this.TASK_TYPES_CACHE_TTL);
    }

    return taskTypes;
  }

  async findAllTaskTypesCursor(query: CursorPaginationDto): Promise<{ data: TaskType[]; nextCursor: string | null }> {
    const limit = query.limit || 20;

    const qb = this.taskTypeRepository.createQueryBuilder('tt');
    const tenantId = TenantContextService.getTenantId();

    qb.where('tt.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit,
      alias: 'tt',
    });
  }

  async findTaskTypeById(id: string): Promise<TaskType> {
    const taskType = await this.taskTypeRepository.findOne({
      where: { id },
    });
    if (!taskType) {
      throw new NotFoundException(`TaskType with ID ${id} not found`);
    }
    return taskType;
  }

  async updateTaskType(id: string, dto: UpdateTaskTypeDto): Promise<TaskType> {
    const taskType = await this.findTaskTypeById(id);
    const oldValues = {
      name: taskType.name,
      defaultCommissionAmount: taskType.defaultCommissionAmount,
    };

    Object.assign(taskType, dto);
    const savedTaskType = await this.taskTypeRepository.save(taskType);

    if (dto.defaultCommissionAmount !== undefined || dto.name !== undefined) {
      await this.auditService.log({
        action: 'UPDATE',
        entityName: 'TaskType',
        entityId: id,
        oldValues,
        newValues: {
          name: savedTaskType.name,
          defaultCommissionAmount: savedTaskType.defaultCommissionAmount,
        },
      });
    }

    return savedTaskType;
  }

  async deleteTaskType(id: string): Promise<void> {
    const taskType = await this.findTaskTypeById(id);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'TaskType',
      entityId: id,
      oldValues: { name: taskType.name },
    });

    await this.taskTypeRepository.remove(taskType);
  }

  async clonePackage(packageId: string, dto: ClonePackageDto): Promise<ServicePackage> {
    // Load source package with all items
    const sourcePackage = await this.packageRepository.findOne({
      where: { id: packageId },
      relations: ['packageItems', 'packageItems.taskType'],
    });

    if (!sourcePackage) {
      throw new NotFoundException(`ServicePackage with ID ${packageId} not found`);
    }

    // Create new package (not a template by default)
    const newPackage = this.packageRepository.create({
      name: dto.newName,
      description: dto.description ?? sourcePackage.description,
      price: dto.newPrice ?? sourcePackage.price,
      isActive: true,
      isTemplate: false, // Clones are not templates by default
      templateCategory: null,
    });

    const savedPackage = await this.packageRepository.save(newPackage);

    // Clone all package items
    const sourceItems = await sourcePackage.packageItems;
    if (sourceItems && sourceItems.length > 0) {
      const clonedItems = sourceItems.map((item) =>
        this.packageItemRepository.create({
          packageId: savedPackage.id,
          taskTypeId: item.taskTypeId,
          quantity: item.quantity,
        }),
      );
      await this.packageItemRepository.save(clonedItems);
    }

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

    return this.findPackageById(savedPackage.id);
  }
}
