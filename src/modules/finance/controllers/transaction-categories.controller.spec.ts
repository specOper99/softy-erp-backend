import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionCategoriesService } from '../services/transaction-categories.service';
import { TransactionCategoriesController } from './transaction-categories.controller';

describe('TransactionCategoriesController', () => {
  let controller: TransactionCategoriesController;
  let service: TransactionCategoriesService;

  const mockCategory = {
    id: 'uuid',
    name: 'Operational',
    description: 'Operational expenses',
    applicableType: TransactionType.EXPENSE,
    isActive: true,
    parentId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionCategoriesController],
      providers: [
        {
          provide: TransactionCategoriesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([mockCategory]),
            findById: jest.fn().mockResolvedValue(mockCategory),
            create: jest.fn().mockResolvedValue(mockCategory),
            update: jest.fn().mockResolvedValue(mockCategory),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<TransactionCategoriesController>(TransactionCategoriesController);
    service = module.get<TransactionCategoriesService>(TransactionCategoriesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findById', async () => {
      await controller.findOne('uuid');
      expect(service.findById).toHaveBeenCalledWith('uuid');
    });
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { name: 'New Category', applicableType: TransactionType.EXPENSE };
      await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { name: 'Updated Category' };
      await controller.update('uuid', dto);
      expect(service.update).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('delete', () => {
    it('should call service.delete', async () => {
      await controller.delete('uuid');
      expect(service.delete).toHaveBeenCalledWith('uuid');
    });
  });
});
