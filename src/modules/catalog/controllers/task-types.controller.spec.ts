import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from '../services/catalog.service';
import { TaskTypesController } from './task-types.controller';

describe('TaskTypesController', () => {
  let controller: TaskTypesController;
  let service: CatalogService;

  const mockTaskType = { id: 'uuid', name: 'Editing' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskTypesController],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            findAllTaskTypes: jest.fn().mockResolvedValue([mockTaskType]),
            findTaskTypeById: jest.fn().mockResolvedValue(mockTaskType),
            createTaskType: jest.fn().mockResolvedValue(mockTaskType),
            updateTaskType: jest.fn().mockResolvedValue(mockTaskType),
            deleteTaskType: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<TaskTypesController>(TaskTypesController);
    service = module.get<CatalogService>(CatalogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAllTaskTypes', async () => {
      await controller.findAll();
      expect(service.findAllTaskTypes).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findTaskTypeById', async () => {
      await controller.findOne('uuid');
      expect(service.findTaskTypeById).toHaveBeenCalledWith('uuid');
    });
  });

  describe('create', () => {
    it('should call service.createTaskType', async () => {
      const dto = { name: 'Coloring' } as any;
      await controller.create(dto);
      expect(service.createTaskType).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should call service.updateTaskType', async () => {
      const dto = { name: 'Advanced Editing' } as any;
      await controller.update('uuid', dto);
      expect(service.updateTaskType).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('remove', () => {
    it('should call service.deleteTaskType', async () => {
      await controller.remove('uuid');
      expect(service.deleteTaskType).toHaveBeenCalledWith('uuid');
    });
  });
});
