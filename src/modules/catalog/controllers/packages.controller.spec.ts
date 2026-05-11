import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import type { CreateServicePackageDto, UpdateServicePackageDto } from '../dto/catalog.dto';
import type { PackageFilterDto } from '../dto/package-filter.dto';
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
            clonePackage: jest.fn().mockResolvedValue(mockPackage),
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
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
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
      const query = {} as PackageFilterDto;
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
});
