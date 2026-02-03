import { Test, TestingModule } from '@nestjs/testing';
import { createMockTask, createMockUser } from '../../../../test/helpers/mock-factories';
import { User } from '../../users/entities/user.entity';
import { AssignTaskDto, UpdateTaskDto } from '../dto';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TasksService } from '../services/tasks.service';
import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  const mockTask = createMockTask({ id: 'uuid', status: TaskStatus.PENDING }) as unknown as Task;
  const mockUser = createMockUser({ id: 'u-uuid' }) as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([mockTask]),
            findAllWithFilters: jest.fn().mockResolvedValue({ data: [mockTask], meta: {} }),
            findAllCursor: jest.fn().mockResolvedValue({ data: [mockTask], meta: {} }),
            findOne: jest.fn().mockResolvedValue(mockTask),
            findByUser: jest.fn().mockResolvedValue([mockTask]),
            findByBooking: jest.fn().mockResolvedValue([mockTask]),
            update: jest.fn().mockResolvedValue(mockTask),
            assignTask: jest.fn().mockResolvedValue(mockTask),
            startTask: jest.fn().mockResolvedValue(mockTask),
            completeTask: jest.fn().mockResolvedValue({ task: mockTask, commissionAccrued: 100, walletUpdated: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllWithFilters', () => {
    it('should call service.findAllWithFilters', async () => {
      const query = {};
      await controller.findAllWithFilters(query);
      expect(service.findAllWithFilters).toHaveBeenCalledWith(query);
    });
  });

  describe('findMyTasks', () => {
    it('should call service.findByUser', async () => {
      await controller.findMyTasks(mockUser);
      expect(service.findByUser).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('findByBooking', () => {
    it('should call service.findByBooking', async () => {
      await controller.findByBooking('b-uuid');
      expect(service.findByBooking).toHaveBeenCalledWith('b-uuid');
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      await controller.findOne('uuid');
      expect(service.findOne).toHaveBeenCalledWith('uuid');
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { notes: 'updated' } as UpdateTaskDto;
      await controller.update('uuid', dto);
      expect(service.update).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('assign', () => {
    it('should call service.assignTask', async () => {
      const dto = { userId: 's-id' } as AssignTaskDto;
      await controller.assign('uuid', dto);
      expect(service.assignTask).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('start', () => {
    it('should call service.startTask', async () => {
      await controller.start('uuid', mockUser);
      expect(service.startTask).toHaveBeenCalledWith('uuid', mockUser);
    });
  });

  describe('complete', () => {
    it('should call service.completeTask', async () => {
      await controller.complete('uuid', mockUser);
      expect(service.completeTask).toHaveBeenCalledWith('uuid', mockUser);
    });
  });
});
