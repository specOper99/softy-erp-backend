import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { createMockTask, createMockUser } from '../../../../test/helpers/mock-factories';
import { User } from '../../users/entities/user.entity';
import { AddTaskAssigneeDto, AssignTaskDto, UpdateTaskAssigneeDto, UpdateTaskDto } from '../dto';
import { TaskAssigneeRole } from '../enums/task-assignee-role.enum';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TasksService } from '../services/tasks.service';
import { TasksController } from './tasks.controller';
import { Role } from '../../users/enums/role.enum';

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
            addTaskAssignee: jest.fn().mockResolvedValue({ id: 'assignee-id' }),
            listTaskAssignees: jest.fn().mockResolvedValue([{ id: 'assignee-id' }]),
            updateTaskAssignee: jest.fn().mockResolvedValue({ id: 'assignee-id', role: TaskAssigneeRole.LEAD }),
            removeTaskAssignee: jest.fn().mockResolvedValue(undefined),
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
      const query = {} as never;
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

  describe('addAssignee', () => {
    it('should call service.addTaskAssignee', async () => {
      const dto = { userId: '11111111-1111-4111-8111-111111111111', role: TaskAssigneeRole.LEAD } as AddTaskAssigneeDto;
      await controller.addAssignee('uuid', dto);
      expect(service.addTaskAssignee).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('listAssignees', () => {
    it('should call service.listTaskAssignees', async () => {
      await controller.listAssignees('uuid', mockUser);
      expect(service.listTaskAssignees).toHaveBeenCalledWith('uuid', mockUser);
    });
  });

  describe('updateAssignee', () => {
    it('should call service.updateTaskAssignee', async () => {
      const dto = { role: TaskAssigneeRole.ASSISTANT } as UpdateTaskAssigneeDto;
      await controller.updateAssignee('uuid', 'u-uuid', dto);
      expect(service.updateTaskAssignee).toHaveBeenCalledWith('uuid', 'u-uuid', dto);
    });
  });

  describe('removeAssignee', () => {
    it('should call service.removeTaskAssignee', async () => {
      await controller.removeAssignee('uuid', 'u-uuid');
      expect(service.removeTaskAssignee).toHaveBeenCalledWith('uuid', 'u-uuid');
    });
  });

  describe('roles metadata', () => {
    it('should require ADMIN and OPS_MANAGER for add/update/remove assignee routes', () => {
      const addRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.addAssignee);
      const updateRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.updateAssignee);
      const removeRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.removeAssignee);

      expect(addRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER]);
      expect(updateRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER]);
      expect(removeRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER]);
    });

    it('should allow FIELD_STAFF read access for list assignees route', () => {
      const listRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.listAssignees);
      expect(listRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF]);
    });
  });
});
