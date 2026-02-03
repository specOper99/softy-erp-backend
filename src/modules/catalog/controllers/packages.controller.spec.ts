import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import { AddPackageItemsDto, CreateServicePackageDto, UpdateServicePackageDto } from '../dto/catalog.dto';
import { CatalogService } from '../services/catalog.service';
import { PackagesController } from './packages.controller';

describe('PackagesController', () => {
  let controller: PackagesController;
  let service: CatalogService;

  const mockPackage = { id: 'uuid', name: 'Standard' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PackagesController],
      providers: [
        GlobalCacheInterceptor,
        {
          provide: CatalogService,
          useValue: {
            findAllPackages: jest.fn().mockResolvedValue([mockPackage]),
            findAllPackagesWithFilters: jest.fn().mockResolvedValue({ data: [mockPackage], meta: {} }),
            findPackageById: jest.fn().mockResolvedValue(mockPackage),
            createPackage: jest.fn().mockResolvedValue(mockPackage),
            updatePackage: jest.fn().mockResolvedValue(mockPackage),
            deletePackage: jest.fn().mockResolvedValue(undefined),
            addPackageItems: jest.fn().mockResolvedValue(mockPackage),
            removePackageItem: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PackagesController>(PackagesController);
    service = module.get<CatalogService>(CatalogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllWithFilters', () => {
    it('should call service.findAllPackagesWithFilters', async () => {
      const query = {};
      await controller.findAllWithFilters(query);
      expect(service.findAllPackagesWithFilters).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should call service.findPackageById', async () => {
      await controller.findOne('uuid');
      expect(service.findPackageById).toHaveBeenCalledWith('uuid');
    });
  });

  describe('create', () => {
    it('should call service.createPackage', async () => {
      const dto = { name: 'Premium' } as CreateServicePackageDto;
      await controller.create(dto);
      expect(service.createPackage).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should call service.updatePackage', async () => {
      const dto = { name: 'Gold' } as UpdateServicePackageDto;
      await controller.update('uuid', dto);
      expect(service.updatePackage).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('remove', () => {
    it('should call service.deletePackage', async () => {
      await controller.remove('uuid');
      expect(service.deletePackage).toHaveBeenCalledWith('uuid');
    });
  });

  describe('addItems', () => {
    it('should call service.addPackageItems', async () => {
      const dto = { items: [{ taskTypeId: '1', quantity: 1 }] } as unknown as AddPackageItemsDto;
      await controller.addItems('uuid', dto);
      expect(service.addPackageItems).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('removeItem', () => {
    it('should call service.removePackageItem', async () => {
      await controller.removeItem('item-uuid');
      expect(service.removePackageItem).toHaveBeenCalledWith('item-uuid');
    });
  });
});
