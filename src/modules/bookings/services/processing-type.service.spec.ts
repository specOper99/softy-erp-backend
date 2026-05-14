import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { createMockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { CatalogService } from '../../catalog/services/catalog.service';
import type { CreateProcessingTypeDto, UpdateProcessingTypeDto } from '../dto/processing-type.dto';
import type { ProcessingType } from '../entities/processing-type.entity';
import { ProcessingTypeRepository } from '../repositories/processing-type.repository';
import { ProcessingTypeService } from './processing-type.service';

describe('ProcessingTypeService', () => {
  let service: ProcessingTypeService;
  let repository: ReturnType<typeof createMockRepository>;
  let catalogService: { findPackageById: jest.Mock };

  const mockType: ProcessingType = {
    id: 'pt-1',
    tenantId: 'tenant-123',
    packageId: 'pkg-1',
    name: 'Raw Edit',
    description: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ProcessingType;

  beforeEach(async () => {
    mockTenantContext('tenant-123');
    repository = createMockRepository<ProcessingType>();
    catalogService = { findPackageById: jest.fn().mockResolvedValue({ id: 'pkg-1', tenantId: 'tenant-123' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessingTypeService,
        {
          provide: ProcessingTypeRepository,
          useValue: repository,
        },
        {
          provide: CatalogService,
          useValue: catalogService,
        },
      ],
    }).compile();

    service = module.get<ProcessingTypeService>(ProcessingTypeService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll', () => {
    it('should return all processing types for the tenant', async () => {
      repository.find.mockResolvedValue([mockType]);
      const result = await service.findAll();
      expect(result).toEqual([mockType]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
    });

    it('should filter processing types by package when packageId is provided', async () => {
      repository.find.mockResolvedValue([mockType]);

      const result = await (
        service as unknown as { findAll: (filter: { packageId: string }) => Promise<ProcessingType[]> }
      ).findAll({
        packageId: 'pkg-1',
      });

      expect(result).toEqual([mockType]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', packageId: 'pkg-1' },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a single processing type', async () => {
      repository.findOne.mockResolvedValue(mockType);
      const result = await service.findOne('pt-1');
      expect(result).toEqual(mockType);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'pt-1', tenantId: 'tenant-123' } });
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByIds', () => {
    it('should return empty array for empty ids', async () => {
      const result = await service.findByIds([]);
      expect(result).toEqual([]);
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('should return matching types for given ids', async () => {
      repository.find.mockResolvedValue([mockType]);
      const result = await service.findByIds(['pt-1']);
      expect(result).toEqual([mockType]);
    });
  });

  describe('create', () => {
    it('should create a new processing type', async () => {
      repository.findOne.mockResolvedValue(null); // no duplicate
      repository.create.mockReturnValue(mockType);
      repository.save.mockResolvedValue(mockType);

      const result = await service.create({ name: 'Raw Edit', packageId: 'pkg-1' } as CreateProcessingTypeDto);

      expect(result).toEqual(mockType);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Raw Edit', tenantId: 'tenant-123', packageId: 'pkg-1' }),
      );
    });

    it('should throw ConflictException when name is duplicate within the same package', async () => {
      repository.findOne.mockResolvedValue(mockType); // existing
      await expect(service.create({ name: 'Raw Edit', packageId: 'pkg-1' } as CreateProcessingTypeDto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', packageId: 'pkg-1', name: 'Raw Edit' },
      });
    });

    it('should default sortOrder to 0 and isActive to true', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockType);
      repository.save.mockResolvedValue(mockType);

      await service.create({ name: 'Montage', packageId: 'pkg-1' } as CreateProcessingTypeDto);

      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0, isActive: true }));
    });

    it('should allow the same name in different packages', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({ ...mockType, packageId: 'pkg-2' });
      repository.save.mockResolvedValue({ ...mockType, packageId: 'pkg-2' });

      await service.create({ name: 'Raw Edit', packageId: 'pkg-2' } as CreateProcessingTypeDto);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', packageId: 'pkg-2', name: 'Raw Edit' },
      });
    });
  });

  describe('update', () => {
    it('should update an existing processing type', async () => {
      repository.findOne.mockResolvedValueOnce(mockType); // findOne in findOne()
      const updated = { ...mockType, name: 'Color Grade' };
      repository.save.mockResolvedValue(updated);

      const result = await service.update('pt-1', {
        name: 'Color Grade',
        packageId: 'pkg-1',
      } as UpdateProcessingTypeDto);
      expect(result.name).toBe('Color Grade');
    });

    it('should throw ConflictException when new name already exists', async () => {
      const anotherType = { ...mockType, id: 'pt-2', name: 'Montage' } as ProcessingType;
      repository.findOne
        .mockResolvedValueOnce(mockType) // initial findOne
        .mockResolvedValueOnce(anotherType); // name uniqueness check

      await expect(service.update('pt-1', { name: 'Montage' })).rejects.toThrow(ConflictException);
      expect(repository.findOne).toHaveBeenLastCalledWith({
        where: { tenantId: 'tenant-123', packageId: 'pkg-1', name: 'Montage' },
      });
    });

    it('should throw NotFoundException when type does not exist', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'Anything' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the processing type', async () => {
      repository.findOne.mockResolvedValue(mockType);
      repository.remove.mockResolvedValue(mockType);

      await service.remove('pt-1');

      expect(repository.remove).toHaveBeenCalledWith(mockType);
    });

    it('should throw NotFoundException when type does not exist', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
