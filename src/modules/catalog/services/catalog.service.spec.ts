import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { SelectQueryBuilder } from 'typeorm';
import {
  createMockPackageItem,
  createMockRepository,
  createMockServicePackage,
  createMockTaskType,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { AuditPublisher } from '../../audit/audit.publisher';
import type { CreateServicePackageDto, CreateTaskTypeDto, UpdateServicePackageDto } from '../dto';
import type { PackageItem } from '../entities/package-item.entity';
import type { ServicePackage } from '../entities/service-package.entity';
import type { TaskType } from '../entities/task-type.entity';
import { PackageItemRepository } from '../repositories/package-item.repository';
import { ServicePackageRepository } from '../repositories/service-package.repository';
import { TaskTypeRepository } from '../repositories/task-type.repository';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let packageRepo: jest.Mocked<ServicePackageRepository>;
  let taskTypeRepo: jest.Mocked<TaskTypeRepository>;
  let packageItemRepo: jest.Mocked<PackageItemRepository>;
  let auditService: jest.Mocked<AuditPublisher>;
  let cacheUtils: jest.Mocked<CacheUtilsService>;

  const mockTenantId = 'tenant-123';
  const mockPackage = createMockServicePackage({
    id: 'pkg-123',
    tenantId: mockTenantId,
    name: 'Wedding Package',
    price: 5000,
    durationMinutes: 120,
    requiredStaffCount: 2,
    revenueAccountCode: 'REV-SERVICES',
    isActive: true,
    packageItems: [],
  });
  const mockTaskType = createMockTaskType({
    id: 'tt-123',
    tenantId: mockTenantId,
    name: 'Photography',
    defaultCommissionAmount: 100,
  });
  const mockPackageItem = createMockPackageItem({
    id: 'item-123',
    packageId: 'pkg-123',
    taskTypeId: 'tt-123',
    quantity: 2,
    tenantId: mockTenantId,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: ServicePackageRepository,
          useValue: createMockRepository(),
        },
        {
          provide: TaskTypeRepository,
          useValue: createMockRepository(),
        },
        {
          provide: PackageItemRepository,
          useValue: createMockRepository(),
        },
        {
          provide: AuditPublisher,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: AvailabilityCacheOwnerService,
          useValue: {
            getAvailability: jest.fn().mockResolvedValue(undefined),
            setAvailability: jest.fn().mockResolvedValue(undefined),
            delAvailability: jest.fn().mockResolvedValue(undefined),
            delAvailabilityForPackage: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    packageRepo = module.get(ServicePackageRepository);
    taskTypeRepo = module.get(TaskTypeRepository);
    packageItemRepo = module.get(PackageItemRepository);
    auditService = module.get(AuditPublisher);
    cacheUtils = module.get(CacheUtilsService);

    mockTenantContext(mockTenantId);

    const qbMock = {
      leftJoinAndMapMany: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockPackage]),
      getOne: jest.fn().mockResolvedValue(mockPackage),
      getCount: jest.fn().mockResolvedValue(1),
    };
    packageRepo.createQueryBuilder.mockReturnValue(qbMock as unknown as SelectQueryBuilder<ServicePackage>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPackage', () => {
    it('should create and return package', async () => {
      const dto: CreateServicePackageDto = {
        name: 'Wedding Package',
        price: 5000,
        description: 'Test',
        durationMinutes: 120,
        requiredStaffCount: 2,
        revenueAccountCode: 'REV-SERVICES',
      };
      packageRepo.create.mockReturnValue(mockPackage as unknown as ServicePackage);
      packageRepo.save.mockResolvedValue(mockPackage as unknown as ServicePackage);

      const result = await service.createPackage(dto);

      expect(packageRepo.create).toHaveBeenCalledWith({
        ...dto,
      });
      expect(auditService.log).toHaveBeenCalled();
      expect(cacheUtils.del).toHaveBeenCalled();
      expect(result).toEqual(mockPackage);
    });

    it('should reject zero price package', async () => {
      const dto: CreateServicePackageDto = {
        name: 'Free Package',
        price: 0,
        description: 'Test',
        durationMinutes: 60,
        requiredStaffCount: 1,
        revenueAccountCode: 'REV-SERVICES',
      };
      await expect(service.createPackage(dto)).rejects.toThrow('catalog.price_must_be_positive');
    });
  });

  describe('findAllPackages', () => {
    it('should return packages from cache if available', async () => {
      cacheUtils.get.mockResolvedValue([mockPackage]);

      const result = await service.findAllPackages({
        page: 1,
        limit: 10,
        getSkip: () => 0,
        getTake: () => 10,
      } as unknown as PaginationDto);

      expect(cacheUtils.get).toHaveBeenCalled();
      expect(packageRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toEqual([mockPackage]);
    });

    it('should query database when cache miss', async () => {
      cacheUtils.get.mockResolvedValue(null);

      const result = await service.findAllPackages({
        page: 1,
        limit: 10,
        getSkip: () => 0,
        getTake: () => 10,
      } as unknown as PaginationDto);

      expect(packageRepo.createQueryBuilder).toHaveBeenCalled();
      expect(cacheUtils.set).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findPackageById', () => {
    it('should return package by id', async () => {
      const result = await service.findPackageById('pkg-123');

      expect(result).toEqual(mockPackage);
    });

    it('should throw NotFoundException if not found', async () => {
      packageRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as unknown as SelectQueryBuilder<ServicePackage>);

      await expect(service.findPackageById('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePackage', () => {
    it('should update and return package', async () => {
      jest.spyOn(service, 'findPackageById').mockResolvedValue({ ...mockPackage } as unknown as ServicePackage);
      packageRepo.save.mockResolvedValue({
        ...mockPackage,
        price: 6000,
      } as unknown as ServicePackage);

      const result = await service.updatePackage('pkg-123', {
        price: 6000,
      } as UpdateServicePackageDto);

      expect(auditService.log).toHaveBeenCalled();
      expect(cacheUtils.del).toHaveBeenCalled();
      expect(result.price).toBe(6000);
    });
  });

  describe('deletePackage', () => {
    it('should delete package', async () => {
      jest.spyOn(service, 'findPackageById').mockResolvedValue(mockPackage as unknown as ServicePackage);
      packageRepo.remove.mockResolvedValue(mockPackage as unknown as ServicePackage);

      await service.deletePackage('pkg-123');

      expect(packageRepo.remove).toHaveBeenCalledWith(mockPackage);
      expect(packageRepo.softRemove).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
      expect(cacheUtils.del).toHaveBeenCalled();
    });

    it('should throw conflict when package is still referenced', async () => {
      jest.spyOn(service, 'findPackageById').mockResolvedValue(mockPackage as unknown as ServicePackage);
      packageRepo.remove.mockRejectedValue({ code: '23503' });

      await expect(service.deletePackage('pkg-123')).rejects.toThrow(ConflictException);
      expect(auditService.log).not.toHaveBeenCalled();
      expect(cacheUtils.del).not.toHaveBeenCalled();
    });
  });

  describe('clonePackage', () => {
    it('should clone package with new name', async () => {
      const sourcePackage = { ...mockPackage, packageItems: [] };
      jest
        .spyOn(service, 'findPackageById')
        .mockResolvedValueOnce(sourcePackage as unknown as ServicePackage)
        .mockResolvedValueOnce({ ...mockPackage, id: 'pkg-new' } as unknown as ServicePackage);
      packageRepo.create.mockReturnValue({
        ...mockPackage,
        id: 'pkg-new',
      } as unknown as ServicePackage);
      packageRepo.save.mockResolvedValue({
        ...mockPackage,
        id: 'pkg-new',
      } as unknown as ServicePackage);

      const result = await service.clonePackage('pkg-123', {
        newName: 'Cloned Package',
      });

      expect(auditService.log).toHaveBeenCalled();
      expect(result.id).toBe('pkg-new');
    });
  });

  // ============ TASK TYPE TESTS ============
  describe('createTaskType', () => {
    it('should create and return task type', async () => {
      const dto: CreateTaskTypeDto = { name: 'Photography', defaultCommissionAmount: 100 };
      taskTypeRepo.create.mockReturnValue(mockTaskType as unknown as TaskType);
      taskTypeRepo.save.mockResolvedValue(mockTaskType as unknown as TaskType);

      const result = await service.createTaskType(dto);

      expect(auditService.log).toHaveBeenCalled();
      expect(result).toEqual(mockTaskType);
    });
  });

  describe('findTaskTypeById', () => {
    it('should return task type by id', async () => {
      taskTypeRepo.findOne.mockResolvedValue(mockTaskType as unknown as TaskType);

      const result = await service.findTaskTypeById('tt-123');

      expect(result).toEqual(mockTaskType);
    });

    it('should throw NotFoundException if not found', async () => {
      taskTypeRepo.findOne.mockResolvedValue(null);

      await expect(service.findTaskTypeById('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllTaskTypes', () => {
    it('should return all task types', async () => {
      taskTypeRepo.find.mockResolvedValue([mockTaskType] as unknown as TaskType[]);
      const result = await service.findAllTaskTypes();
      expect(result).toEqual([mockTaskType]);
    });

    it('should return task types from cache if availble', async () => {
      cacheUtils.get.mockResolvedValue([mockTaskType]);
      const result = await service.findAllTaskTypes({
        page: 1,
        limit: 10,
        getSkip: () => 0,
        getTake: () => 10,
      } as unknown as PaginationDto);
      expect(cacheUtils.get).toHaveBeenCalled();
      expect(result).toEqual([mockTaskType]);
    });
  });

  describe('updateTaskType', () => {
    it('should update task type commission', async () => {
      taskTypeRepo.findOne.mockResolvedValue(mockTaskType as unknown as TaskType);
      taskTypeRepo.save.mockResolvedValue(mockTaskType as unknown as TaskType);

      await service.updateTaskType('tt-123', {
        defaultCommissionAmount: 150,
      });

      expect(taskTypeRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('deleteTaskType', () => {
    it('should delete a task type', async () => {
      taskTypeRepo.findOne.mockResolvedValue(mockTaskType as unknown as TaskType);
      taskTypeRepo.remove.mockResolvedValue(mockTaskType as unknown as TaskType);

      await service.deleteTaskType('tt-123');

      expect(auditService.log).toHaveBeenCalled();
      expect(taskTypeRepo.remove).toHaveBeenCalledWith(mockTaskType);
    });
  });

  // ============ PACKAGE ITEM TESTS ============
  describe('PackageItem Management', () => {
    describe('addPackageItems', () => {
      it('should add single item to package', async () => {
        const dto = {
          items: [{ taskTypeId: 'tt-123', quantity: 1 }],
        };
        jest.spyOn(service, 'findPackageById').mockResolvedValue(mockPackage as unknown as ServicePackage);
        packageItemRepo.create.mockReturnValue(mockPackageItem as unknown as PackageItem);
        packageItemRepo.save.mockResolvedValue([mockPackageItem] as unknown as PackageItem[]);

        await service.addPackageItems('pkg-123', dto);
        expect(packageItemRepo.save).toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalled();
      });

      it('should throw NotFoundException for invalid package id', async () => {
        const dto = {
          items: [{ taskTypeId: 'tt-123', quantity: 1 }],
        };
        jest.spyOn(service, 'findPackageById').mockRejectedValue(new NotFoundException());

        await expect(service.addPackageItems('invalid', dto)).rejects.toThrow(NotFoundException);
      });
    });

    describe('removePackageItem', () => {
      it('should remove existing package item', async () => {
        packageItemRepo.findOne.mockResolvedValue(mockPackageItem as unknown as PackageItem);
        packageItemRepo.remove.mockResolvedValue(mockPackageItem as unknown as PackageItem);

        await service.removePackageItem('item-123');

        expect(packageItemRepo.remove).toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalled();
      });

      it('should throw NotFoundException for non-existent item', async () => {
        packageItemRepo.findOne.mockResolvedValue(null);

        await expect(service.removePackageItem('invalid')).rejects.toThrow(NotFoundException);
      });
    });
  });

  // ─── Cache invalidation tests (F7) ──────────────────────────────────────────

  describe('cache invalidation', () => {
    const expectedPackagesCacheKey = `catalog:packages:${mockTenantId}`;
    const expectedTaskTypesCacheKey = `catalog:task-types:${mockTenantId}`;

    describe('addPackageItems', () => {
      it('invalidates packages cache after adding items', async () => {
        jest.spyOn(service, 'findPackageById').mockResolvedValue(mockPackage as unknown as ServicePackage);
        packageItemRepo.create.mockReturnValue(mockPackageItem as unknown as PackageItem);
        packageItemRepo.save.mockResolvedValue([mockPackageItem] as unknown as PackageItem);

        await service.addPackageItems('pkg-123', { items: [{ taskTypeId: 'tt-123', quantity: 1 }] });

        expect(cacheUtils.del).toHaveBeenCalledWith(expectedPackagesCacheKey);
      });
    });

    describe('removePackageItem', () => {
      it('invalidates packages cache after removing an item', async () => {
        packageItemRepo.findOne.mockResolvedValue(mockPackageItem as unknown as PackageItem);
        packageItemRepo.remove.mockResolvedValue(mockPackageItem as unknown as PackageItem);

        await service.removePackageItem('item-123');

        expect(cacheUtils.del).toHaveBeenCalledWith(expectedPackagesCacheKey);
      });
    });

    describe('clonePackage', () => {
      it('invalidates packages cache after cloning', async () => {
        const clonedPkg = { ...mockPackage, id: 'cloned-pkg', name: 'Clone', packageItems: [] };
        jest
          .spyOn(service, 'findPackageById')
          .mockResolvedValueOnce({ ...mockPackage, packageItems: [] } as unknown as ServicePackage)
          .mockResolvedValueOnce(clonedPkg as unknown as ServicePackage);
        packageRepo.create.mockReturnValue(clonedPkg as unknown as ServicePackage);
        packageRepo.save.mockResolvedValue(clonedPkg as unknown as ServicePackage);

        await service.clonePackage('pkg-123', { newName: 'Clone' });

        expect(cacheUtils.del).toHaveBeenCalledWith(expectedPackagesCacheKey);
      });
    });

    describe('updateTaskType', () => {
      it('invalidates task-types cache after updating', async () => {
        taskTypeRepo.findOne.mockResolvedValue(mockTaskType as unknown as TaskType);
        taskTypeRepo.save.mockResolvedValue({ ...mockTaskType, name: 'Updated' } as unknown as TaskType);

        await service.updateTaskType('tt-123', { name: 'Updated' });

        expect(cacheUtils.del).toHaveBeenCalledWith(expectedTaskTypesCacheKey);
      });
    });

    describe('deleteTaskType', () => {
      it('invalidates task-types cache after deleting', async () => {
        taskTypeRepo.findOne.mockResolvedValue(mockTaskType as unknown as TaskType);
        taskTypeRepo.remove.mockResolvedValue(mockTaskType as unknown as TaskType);

        await service.deleteTaskType('tt-123');

        expect(cacheUtils.del).toHaveBeenCalledWith(expectedTaskTypesCacheKey);
      });
    });
  });
});
