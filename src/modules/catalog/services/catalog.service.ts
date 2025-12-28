import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import {
  AddPackageItemsDto,
  CreateServicePackageDto,
  CreateTaskTypeDto,
  UpdateServicePackageDto,
  UpdateTaskTypeDto,
} from '../dto';
import { PackageItem } from '../entities/package-item.entity';
import { ServicePackage } from '../entities/service-package.entity';
import { TaskType } from '../entities/task-type.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(ServicePackage)
    private readonly packageRepository: Repository<ServicePackage>,
    @InjectRepository(TaskType)
    private readonly taskTypeRepository: Repository<TaskType>,
    @InjectRepository(PackageItem)
    private readonly packageItemRepository: Repository<PackageItem>,
    private readonly auditService: AuditService,
  ) {}

  // Service Package Methods
  async createPackage(dto: CreateServicePackageDto): Promise<ServicePackage> {
    const tenantId = TenantContextService.getTenantId();
    const pkg = this.packageRepository.create({ ...dto, tenantId });
    const savedPkg = await this.packageRepository.save(pkg);

    await this.auditService.log({
      action: 'CREATE',
      entityName: 'ServicePackage',
      entityId: savedPkg.id,
      newValues: { name: savedPkg.name, price: savedPkg.price },
    });

    return savedPkg;
  }

  async findAllPackages(): Promise<ServicePackage[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.packageRepository.find({
      where: { tenantId },
      relations: ['packageItems', 'packageItems.taskType'],
    });
  }

  async findPackageById(id: string): Promise<ServicePackage> {
    const tenantId = TenantContextService.getTenantId();
    const pkg = await this.packageRepository.findOne({
      where: { id, tenantId },
      relations: ['packageItems', 'packageItems.taskType'],
    });
    if (!pkg) {
      throw new NotFoundException(`ServicePackage with ID ${id} not found`);
    }
    return pkg;
  }

  async updatePackage(
    id: string,
    dto: UpdateServicePackageDto,
  ): Promise<ServicePackage> {
    const pkg = await this.findPackageById(id);
    const oldValues = {
      name: pkg.name,
      price: pkg.price,
      isActive: pkg.isActive,
    };

    Object.assign(pkg, dto);
    const savedPkg = await this.packageRepository.save(pkg);

    // Log price or status changes
    if (
      dto.price !== undefined ||
      dto.isActive !== undefined ||
      dto.name !== undefined
    ) {
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
  }

  async addPackageItems(
    packageId: string,
    dto: AddPackageItemsDto,
  ): Promise<PackageItem[]> {
    await this.findPackageById(packageId);
    const tenantId = TenantContextService.getTenantId();
    const items = dto.items.map((item) =>
      this.packageItemRepository.create({
        packageId,
        taskTypeId: item.taskTypeId,
        quantity: item.quantity,
        tenantId,
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
    const tenantId = TenantContextService.getTenantId();
    const item = await this.packageItemRepository.findOne({
      where: { id: itemId, tenantId },
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
    const taskType = this.taskTypeRepository.create({ ...dto, tenantId });
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

    return savedTaskType;
  }

  async findAllTaskTypes(): Promise<TaskType[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskTypeRepository.find({ where: { tenantId } });
  }

  async findTaskTypeById(id: string): Promise<TaskType> {
    const tenantId = TenantContextService.getTenantId();
    const taskType = await this.taskTypeRepository.findOne({
      where: { id, tenantId },
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
}
