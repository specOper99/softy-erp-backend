import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { mockTenantContext } from '../../../../test/helpers/mock-factories';
import type { CreateProcessingTypeDto, UpdateProcessingTypeDto } from '../dto/processing-type.dto';
import type { ProcessingType } from '../entities/processing-type.entity';
import { ProcessingTypeService } from '../services/processing-type.service';
import { ProcessingTypesController } from './processing-types.controller';

describe('ProcessingTypesController', () => {
  let controller: ProcessingTypesController;
  let service: jest.Mocked<ProcessingTypeService>;

  const mockType = {
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessingTypesController],
      providers: [
        {
          provide: ProcessingTypeService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([mockType]),
            findOne: jest.fn().mockResolvedValue(mockType),
            create: jest.fn().mockResolvedValue(mockType),
            update: jest.fn().mockResolvedValue(mockType),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<ProcessingTypesController>(ProcessingTypesController);
    service = module.get(ProcessingTypeService);
  });

  describe('findAll', () => {
    it('should return all processing types', async () => {
      const result = await controller.findAll();
      expect(result).toEqual([mockType]);
      expect(service.findAll).toHaveBeenCalled();
    });

    it('should pass packageId query filter to the service', async () => {
      const result = await (
        controller as unknown as { findAll: (packageId?: string) => Promise<ProcessingType[]> }
      ).findAll('pkg-1');

      expect(result).toEqual([mockType]);
      expect(service.findAll).toHaveBeenCalledWith({ packageId: 'pkg-1' });
    });
  });

  describe('findOne', () => {
    it('should return a single processing type', async () => {
      const result = await controller.findOne('pt-1');
      expect(result).toEqual(mockType);
      expect(service.findOne).toHaveBeenCalledWith('pt-1');
    });
  });

  describe('create', () => {
    it('should create a processing type', async () => {
      const dto: CreateProcessingTypeDto = { name: 'Raw Edit', packageId: 'pkg-1' };
      const result = await controller.create(dto);
      expect(result).toEqual(mockType);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should update a processing type', async () => {
      const dto: UpdateProcessingTypeDto = { name: 'Montage' };
      const result = await controller.update('pt-1', dto);
      expect(result).toEqual(mockType);
      expect(service.update).toHaveBeenCalledWith('pt-1', dto);
    });
  });

  describe('remove', () => {
    it('should delete a processing type', async () => {
      await controller.remove('pt-1');
      expect(service.remove).toHaveBeenCalledWith('pt-1');
    });
  });
});
