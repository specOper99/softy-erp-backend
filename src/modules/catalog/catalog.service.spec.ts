import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { PackageItem } from './entities/package-item.entity';
import { ServicePackage } from './entities/service-package.entity';
import { TaskType } from './entities/task-type.entity';
import { CatalogService } from './services/catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;

  const mockPackage = {
    id: 'pkg-uuid-123',
    name: 'Wedding Package',
    description: 'Complete wedding coverage',
    price: 1500.0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    packageItems: [],
  };

  const mockTaskType = {
    id: 'task-type-uuid-123',
    name: 'Photography',
    description: 'Event photography',
    defaultCommissionAmount: 100.0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPackageItem = {
    id: 'item-uuid-123',
    packageId: 'pkg-uuid-123',
    taskTypeId: 'task-type-uuid-123',
    quantity: 2,
    createdAt: new Date(),
  };

  const mockPackageRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((pkg) =>
        Promise.resolve({ id: 'pkg-uuid-123', ...pkg }),
      ),
    find: jest.fn().mockResolvedValue([mockPackage]),
    findOne: jest.fn().mockImplementation(({ where }) => {
      if (where.id === 'pkg-uuid-123') return Promise.resolve(mockPackage);
      return Promise.resolve(null);
    }),
    remove: jest.fn().mockResolvedValue(mockPackage),
  };

  const mockTaskTypeRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((tt) =>
        Promise.resolve({ id: 'task-type-uuid-123', ...tt }),
      ),
    find: jest.fn().mockResolvedValue([mockTaskType]),
    findOne: jest.fn().mockImplementation(({ where }) => {
      if (where.id === 'task-type-uuid-123')
        return Promise.resolve(mockTaskType);
      return Promise.resolve(null);
    }),
    remove: jest.fn().mockResolvedValue(mockTaskType),
  };

  const mockPackageItemRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((item) =>
        Promise.resolve({ id: 'item-uuid-123', ...item }),
      ),
    find: jest.fn().mockResolvedValue([mockPackageItem]),
    findOne: jest.fn().mockImplementation(({ where }) => {
      if (where.id === 'item-uuid-123') return Promise.resolve(mockPackageItem);
      return Promise.resolve(null);
    }),
    remove: jest.fn().mockResolvedValue(mockPackageItem),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: getRepositoryToken(ServicePackage),
          useValue: mockPackageRepository,
        },
        {
          provide: getRepositoryToken(TaskType),
          useValue: mockTaskTypeRepository,
        },
        {
          provide: getRepositoryToken(PackageItem),
          useValue: mockPackageItemRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============ SERVICE PACKAGE TESTS ============
  describe('ServicePackage CRUD', () => {
    describe('createPackage', () => {
      it('should create a new package with valid data', async () => {
        const dto = { name: 'New Package', description: 'Test', price: 1000 };
        const result = await service.createPackage(dto);
        expect(result).toHaveProperty('id');
        expect(mockPackageRepository.create).toHaveBeenCalledWith(dto);
      });

      it('should handle zero price package', async () => {
        const dto = { name: 'Free Package', price: 0 };
        const result = await service.createPackage(dto);
        expect(result.price).toBe(0);
      });

      it('should handle very high price package', async () => {
        const dto = { name: 'Premium', price: 999999999.99 };
        const result = await service.createPackage(dto);
        expect(result).toHaveProperty('id');
      });
    });

    describe('findAllPackages', () => {
      it('should return all packages', async () => {
        const result = await service.findAllPackages();
        expect(result).toEqual([mockPackage]);
      });

      it('should return empty array when no packages exist', async () => {
        mockPackageRepository.find.mockResolvedValueOnce([]);
        const result = await service.findAllPackages();
        expect(result).toEqual([]);
      });
    });

    describe('findPackageById', () => {
      it('should return package by valid id', async () => {
        const result = await service.findPackageById('pkg-uuid-123');
        expect(result).toEqual(mockPackage);
      });

      it('should throw NotFoundException for invalid id', async () => {
        await expect(service.findPackageById('invalid-id')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should throw NotFoundException for empty string id', async () => {
        await expect(service.findPackageById('')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('updatePackage', () => {
      it('should update package name', async () => {
        await service.updatePackage('pkg-uuid-123', {
          name: 'Updated Name',
        });
        expect(mockPackageRepository.save).toHaveBeenCalled();
      });

      it('should update package price', async () => {
        await service.updatePackage('pkg-uuid-123', {
          price: 2000,
        });
        expect(mockPackageRepository.save).toHaveBeenCalled();
      });

      it('should throw NotFoundException when updating non-existent package', async () => {
        await expect(
          service.updatePackage('invalid-id', { name: 'Test' }),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('deletePackage', () => {
      it('should delete existing package', async () => {
        await service.deletePackage('pkg-uuid-123');
        expect(mockPackageRepository.remove).toHaveBeenCalled();
      });

      it('should throw NotFoundException when deleting non-existent package', async () => {
        await expect(service.deletePackage('invalid-id')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });

  // ============ TASK TYPE TESTS ============
  describe('TaskType CRUD', () => {
    describe('createTaskType', () => {
      it('should create task type with commission', async () => {
        const dto = { name: 'Photography', defaultCommissionAmount: 100 };
        const result = await service.createTaskType(dto);
        expect(result).toHaveProperty('id');
      });

      it('should create task type with zero commission', async () => {
        const dto = { name: 'Volunteer Work', defaultCommissionAmount: 0 };
        const result = await service.createTaskType(dto);
        expect(result).toHaveProperty('id');
      });

      it('should handle high commission amount', async () => {
        const dto = { name: 'Premium Task', defaultCommissionAmount: 9999.99 };
        const result = await service.createTaskType(dto);
        expect(result).toHaveProperty('id');
      });
    });

    describe('findTaskTypeById', () => {
      it('should return task type by valid id', async () => {
        const result = await service.findTaskTypeById('task-type-uuid-123');
        expect(result).toEqual(mockTaskType);
      });

      it('should throw NotFoundException for invalid task type id', async () => {
        await expect(service.findTaskTypeById('invalid-id')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('updateTaskType', () => {
      it('should update task type commission', async () => {
        await service.updateTaskType('task-type-uuid-123', {
          defaultCommissionAmount: 150,
        });
        expect(mockTaskTypeRepository.save).toHaveBeenCalled();
      });

      it('should update task type name', async () => {
        await service.updateTaskType('task-type-uuid-123', {
          name: 'New Name',
        });
        expect(mockTaskTypeRepository.save).toHaveBeenCalled();
      });
    });
  });

  // ============ PACKAGE ITEM TESTS ============
  describe('PackageItem Management', () => {
    describe('addPackageItems', () => {
      it('should add single item to package', async () => {
        const dto = {
          items: [{ taskTypeId: 'task-type-uuid-123', quantity: 1 }],
        };
        await service.addPackageItems('pkg-uuid-123', dto);
        expect(mockPackageItemRepository.save).toHaveBeenCalled();
      });

      it('should add multiple items to package', async () => {
        const dto = {
          items: [
            { taskTypeId: 'task-type-uuid-123', quantity: 1 },
            { taskTypeId: 'task-type-uuid-456', quantity: 2 },
          ],
        };
        mockTaskTypeRepository.findOne.mockResolvedValue(mockTaskType);
        await service.addPackageItems('pkg-uuid-123', dto);
        expect(mockPackageItemRepository.create).toHaveBeenCalledTimes(2);
      });

      it('should handle item with high quantity', async () => {
        const dto = {
          items: [{ taskTypeId: 'task-type-uuid-123', quantity: 100 }],
        };
        const result = await service.addPackageItems('pkg-uuid-123', dto);
        expect(result).toBeDefined();
      });

      it('should throw NotFoundException for invalid package id', async () => {
        const dto = {
          items: [{ taskTypeId: 'task-type-uuid-123', quantity: 1 }],
        };
        await expect(
          service.addPackageItems('invalid-id', dto),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('removePackageItem', () => {
      it('should remove existing package item', async () => {
        await service.removePackageItem('item-uuid-123');
        expect(mockPackageItemRepository.remove).toHaveBeenCalled();
      });

      it('should throw NotFoundException for non-existent item', async () => {
        await expect(service.removePackageItem('invalid-id')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });
});
