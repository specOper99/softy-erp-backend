import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { TenantsService } from '../../tenants/tenants.service';
import { Role } from '../../users/enums/role.enum';
import { CreateTaskTypeEligibilityDto } from '../dto/task-type-eligibility.dto';
import { TaskTypeEligibilityService } from '../services/task-type-eligibility.service';
import { TaskTypeEligibilityController } from './task-type-eligibility.controller';

describe('TaskTypeEligibilityController', () => {
  let controller: TaskTypeEligibilityController;
  let service: TaskTypeEligibilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskTypeEligibilityController],
      providers: [
        {
          provide: TaskTypeEligibilityService,
          useValue: {
            createEligibility: jest.fn(),
            deleteEligibility: jest.fn(),
            getEligibleTaskTypesForUser: jest.fn(),
            getEligibleStaffForTaskType: jest.fn(),
          },
        },
        {
          provide: TenantsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ subscriptionPlan: 'PRO' }),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<TaskTypeEligibilityController>(TaskTypeEligibilityController);
    service = module.get<TaskTypeEligibilityService>(TaskTypeEligibilityService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.createEligibility', async () => {
      const dto = {
        userId: '11111111-1111-4111-8111-111111111111',
        taskTypeId: '22222222-2222-4222-8222-222222222222',
      } as CreateTaskTypeEligibilityDto;

      await controller.create(dto);

      expect(service.createEligibility).toHaveBeenCalledWith(dto);
    });

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, TaskTypeEligibilityController.prototype.create);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('remove', () => {
    it('should call service.deleteEligibility', async () => {
      await controller.remove('user-id', 'task-type-id');

      expect(service.deleteEligibility).toHaveBeenCalledWith('user-id', 'task-type-id');
    });

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, TaskTypeEligibilityController.prototype.remove);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  describe('findEligibleTaskTypesForUser', () => {
    it('should call service.getEligibleTaskTypesForUser', async () => {
      await controller.findEligibleTaskTypesForUser('user-id');

      expect(service.getEligibleTaskTypesForUser).toHaveBeenCalledWith('user-id');
    });

    it('should require ADMIN and OPS_MANAGER roles', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        TaskTypeEligibilityController.prototype.findEligibleTaskTypesForUser,
      );
      expect(roles).toEqual([Role.ADMIN, Role.OPS_MANAGER]);
    });
  });

  describe('findEligibleStaffForTaskType', () => {
    it('should call service.getEligibleStaffForTaskType', async () => {
      await controller.findEligibleStaffForTaskType('task-type-id');

      expect(service.getEligibleStaffForTaskType).toHaveBeenCalledWith('task-type-id');
    });

    it('should require ADMIN and OPS_MANAGER roles', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        TaskTypeEligibilityController.prototype.findEligibleStaffForTaskType,
      );
      expect(roles).toEqual([Role.ADMIN, Role.OPS_MANAGER]);
    });
  });
});
