import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Role } from '../../users/enums/role.enum';
import { CreateTaskTypeDto, UpdateTaskTypeDto } from '../dto/catalog.dto';
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
        GlobalCacheInterceptor,
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
      const dto = { name: 'Coloring' } as CreateTaskTypeDto;
      await controller.create(dto);
      expect(service.createTaskType).toHaveBeenCalledWith(dto);
    });

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, TaskTypesController.prototype.create);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('update', () => {
    it('should call service.updateTaskType', async () => {
      const dto = { name: 'Advanced Editing' } as UpdateTaskTypeDto;
      await controller.update('uuid', dto);
      expect(service.updateTaskType).toHaveBeenCalledWith('uuid', dto);
    });

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, TaskTypesController.prototype.update);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('remove', () => {
    it('should call service.deleteTaskType', async () => {
      await controller.remove('uuid');
      expect(service.deleteTaskType).toHaveBeenCalledWith('uuid');
    });

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, TaskTypesController.prototype.remove);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('RBAC Regression Tests', () => {
    let reflector: Reflector;
    let guard: RolesGuard;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [TaskTypesController],
        providers: [
          GlobalCacheInterceptor,
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
      reflector = module.get<Reflector>(Reflector);
      guard = new RolesGuard(reflector);
    });

    it('should block OPS_MANAGER from creating task-types (ADMIN only)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.OPS_MANAGER } }),
        }),
        getHandler: () => controller.create,
        getClass: () => TaskTypesController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should block OPS_MANAGER from updating task-types (ADMIN only)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.OPS_MANAGER } }),
        }),
        getHandler: () => controller.update,
        getClass: () => TaskTypesController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow ADMIN to create task-types', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN } }),
        }),
        getHandler: () => controller.create,
        getClass: () => TaskTypesController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow ADMIN to update task-types', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN } }),
        }),
        getHandler: () => controller.update,
        getClass: () => TaskTypesController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
