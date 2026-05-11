import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { SelectQueryBuilder } from 'typeorm';
import {
  createMockRepository,
  createMockServicePackage,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { AuditPublisher } from '../../audit/audit.publisher';
import type { CreateServicePackageDto, UpdateServicePackageDto } from '../dto';
import type { ServicePackage } from '../entities/service-package.entity';
import { ServicePackageRepository } from '../repositories/service-package.repository';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let packageRepo: jest.Mocked<ServicePackageRepository>;
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
      const sourcePackage = { ...mockPackage };
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

  describe('cache invalidation', () => {
    const expectedPackagesCacheKey = `catalog:packages:${mockTenantId}`;

    describe('clonePackage', () => {
      it('invalidates packages cache after cloning', async () => {
        const clonedPkg = { ...mockPackage, id: 'cloned-pkg', name: 'Clone' };
        jest
          .spyOn(service, 'findPackageById')
          .mockResolvedValueOnce({ ...mockPackage } as unknown as ServicePackage)
          .mockResolvedValueOnce(clonedPkg as unknown as ServicePackage);
        packageRepo.create.mockReturnValue(clonedPkg as unknown as ServicePackage);
        packageRepo.save.mockResolvedValue(clonedPkg as unknown as ServicePackage);

        await service.clonePackage('pkg-123', { newName: 'Clone' });

        expect(cacheUtils.del).toHaveBeenCalledWith(expectedPackagesCacheKey);
      });
    });
  });
});
