import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createMockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { AuditPublisher } from '../../audit/audit.publisher';
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
  const mockPackage = {
    id: 'pkg-123',
    tenantId: mockTenantId,
    name: 'Wedding Package',
    price: 5000,
    isActive: true,
    packageItems: [],
  };
  const mockTaskType = {
    id: 'tt-123',
    tenantId: mockTenantId,
    name: 'Photography',
    defaultCommissionAmount: 100,
  };
  const mockPackageItem = {
    id: 'item-123',
    packageId: 'pkg-123',
    taskTypeId: 'tt-123',
    quantity: 2,
    tenantId: mockTenantId,
  };

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
          useValue: { log: jest.fn() },
        },
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPackage', () => {
    it('should create and return package', async () => {
      const dto = { name: 'Wedding Package', price: 5000 };
      packageRepo.create.mockReturnValue(mockPackage as any);
      packageRepo.save.mockResolvedValue(mockPackage as any);

      const result = await service.createPackage(dto as any);

      expect(packageRepo.create).toHaveBeenCalledWith({
        ...dto,
      });
      expect(auditService.log).toHaveBeenCalled();
      expect(cacheUtils.del).toHaveBeenCalled();
      expect(result).toEqual(mockPackage);
    });

    it('should reject zero price package', async () => {
      const dto = { name: 'Free Package', price: 0 };
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
      } as any);

      expect(cacheUtils.get).toHaveBeenCalled();
      expect(packageRepo.find).not.toHaveBeenCalled();
      expect(result).toEqual([mockPackage]);
    });

    it('should query database when cache miss', async () => {
      cacheUtils.get.mockResolvedValue(null);
      packageRepo.find.mockResolvedValue([mockPackage] as any);

      const result = await service.findAllPackages({
        page: 1,
        limit: 10,
        getSkip: () => 0,
        getTake: () => 10,
      } as any);

      expect(packageRepo.find).toHaveBeenCalled();
      expect(cacheUtils.set).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findPackageById', () => {
    it('should return package by id', async () => {
      packageRepo.findOne.mockResolvedValue(mockPackage as any);

      const result = await service.findPackageById('pkg-123');

      expect(result).toEqual(mockPackage);
    });

    it('should throw NotFoundException if not found', async () => {
      packageRepo.findOne.mockResolvedValue(null);

      await expect(service.findPackageById('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePackage', () => {
    it('should update and return package', async () => {
      packageRepo.findOne.mockResolvedValue({ ...mockPackage } as any);
      packageRepo.save.mockResolvedValue({
        ...mockPackage,
        price: 6000,
      } as any);

      const result = await service.updatePackage('pkg-123', {
        price: 6000,
      } as any);

      expect(auditService.log).toHaveBeenCalled();
      expect(cacheUtils.del).toHaveBeenCalled();
      expect(result.price).toBe(6000);
    });
  });

  describe('deletePackage', () => {
    it('should delete package', async () => {
      packageRepo.findOne.mockResolvedValue(mockPackage as any);
      packageRepo.remove.mockResolvedValue(mockPackage as any);

      await service.deletePackage('pkg-123');

      expect(auditService.log).toHaveBeenCalled();
      expect(packageRepo.remove).toHaveBeenCalledWith(mockPackage);
    });
  });

  describe('clonePackage', () => {
    it('should clone package with new name', async () => {
      const sourcePackage = { ...mockPackage, packageItems: [] };
      packageRepo.findOne.mockResolvedValueOnce(sourcePackage as any);
      packageRepo.create.mockReturnValue({
        ...mockPackage,
        id: 'pkg-new',
      } as any);
      packageRepo.save.mockResolvedValue({
        ...mockPackage,
        id: 'pkg-new',
      } as any);
      packageRepo.findOne.mockResolvedValueOnce({
        ...mockPackage,
        id: 'pkg-new',
      } as any);

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
      const dto = { name: 'Photography', defaultCommissionAmount: 100 };
      taskTypeRepo.create.mockReturnValue(mockTaskType as any);
      taskTypeRepo.save.mockResolvedValue(mockTaskType as any);

      const result = await service.createTaskType(dto as any);

      expect(auditService.log).toHaveBeenCalled();
      expect(result).toEqual(mockTaskType);
    });
  });

  describe('findTaskTypeById', () => {
    it('should return task type by id', async () => {
      taskTypeRepo.findOne.mockResolvedValue(mockTaskType as any);

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
      taskTypeRepo.find.mockResolvedValue([mockTaskType as any]);
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
      } as any);
      expect(cacheUtils.get).toHaveBeenCalled();
      expect(result).toEqual([mockTaskType]);
    });
  });

  describe('updateTaskType', () => {
    it('should update task type commission', async () => {
      taskTypeRepo.findOne.mockResolvedValue(mockTaskType as any);
      taskTypeRepo.save.mockResolvedValue(mockTaskType as any);

      await service.updateTaskType('tt-123', {
        defaultCommissionAmount: 150,
      });

      expect(taskTypeRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('deleteTaskType', () => {
    it('should delete a task type', async () => {
      taskTypeRepo.findOne.mockResolvedValue(mockTaskType as any);
      taskTypeRepo.remove.mockResolvedValue(mockTaskType as any);

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
        packageRepo.findOne.mockResolvedValue(mockPackage as any);
        packageItemRepo.create.mockReturnValue(mockPackageItem as any);
        packageItemRepo.save.mockResolvedValue([mockPackageItem] as any);

        await service.addPackageItems('pkg-123', dto);
        expect(packageItemRepo.save).toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalled();
      });

      it('should throw NotFoundException for invalid package id', async () => {
        const dto = {
          items: [{ taskTypeId: 'tt-123', quantity: 1 }],
        };
        packageRepo.findOne.mockResolvedValue(null);

        await expect(service.addPackageItems('invalid', dto)).rejects.toThrow(NotFoundException);
      });
    });

    describe('removePackageItem', () => {
      it('should remove existing package item', async () => {
        packageItemRepo.findOne.mockResolvedValue(mockPackageItem as any);
        packageItemRepo.remove.mockResolvedValue(mockPackageItem as any);

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
});
