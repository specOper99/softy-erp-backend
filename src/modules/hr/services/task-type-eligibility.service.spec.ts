import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeleteResult } from 'typeorm';
import { createMockRepository, MockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { TaskType } from '../../catalog/entities/task-type.entity';
import { User } from '../../users/entities/user.entity';
import { Profile, TaskTypeEligibility } from '../entities';
import { TaskTypeEligibilityService } from './task-type-eligibility.service';

describe('TaskTypeEligibilityService', () => {
  let service: TaskTypeEligibilityService;
  let eligibilityRepo: MockRepository<TaskTypeEligibility>;
  let taskTypeRepo: MockRepository<TaskType>;
  let userRepo: MockRepository<User>;
  let profileRepo: MockRepository<Profile>;

  const tenantId = 'tenant-123';
  const userId = '11111111-1111-4111-8111-111111111111';
  const taskTypeId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskTypeEligibilityService,
        {
          provide: getRepositoryToken(TaskTypeEligibility),
          useValue: createMockRepository<TaskTypeEligibility>(),
        },
        {
          provide: getRepositoryToken(TaskType),
          useValue: createMockRepository<TaskType>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: createMockRepository<Profile>(),
        },
      ],
    }).compile();

    service = module.get<TaskTypeEligibilityService>(TaskTypeEligibilityService);
    eligibilityRepo = module.get(getRepositoryToken(TaskTypeEligibility));
    taskTypeRepo = module.get(getRepositoryToken(TaskType));
    userRepo = module.get(getRepositoryToken(User));
    profileRepo = module.get(getRepositoryToken(Profile));

    mockTenantContext(tenantId);

    userRepo.findOne.mockResolvedValue({ id: userId, tenantId } as User);
    profileRepo.findOne.mockResolvedValue({ id: 'profile-1', userId, tenantId } as Profile);
    taskTypeRepo.findOne.mockResolvedValue({ id: taskTypeId, tenantId, name: 'Editing' } as TaskType);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createEligibility', () => {
    it('should create eligibility for valid user and task type', async () => {
      eligibilityRepo.findOne.mockResolvedValue(null);
      eligibilityRepo.create.mockReturnValue({ tenantId, userId, taskTypeId } as TaskTypeEligibility);
      eligibilityRepo.save.mockResolvedValue({ id: 'elig-1', tenantId, userId, taskTypeId } as TaskTypeEligibility);

      const result = await service.createEligibility({ userId, taskTypeId });

      expect(eligibilityRepo.create).toHaveBeenCalledWith({ tenantId, userId, taskTypeId });
      expect(result).toMatchObject({ id: 'elig-1', userId, taskTypeId });
    });

    it('should throw ConflictException when eligibility already exists', async () => {
      eligibilityRepo.findOne.mockResolvedValue({ id: 'elig-1', tenantId, userId, taskTypeId } as TaskTypeEligibility);

      await expect(service.createEligibility({ userId, taskTypeId })).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteEligibility', () => {
    it('should delete eligibility', async () => {
      eligibilityRepo.delete.mockResolvedValue({ affected: 1, raw: [] } as DeleteResult);

      await service.deleteEligibility(userId, taskTypeId);

      expect(eligibilityRepo.delete).toHaveBeenCalledWith({ tenantId, userId, taskTypeId });
    });

    it('should throw NotFoundException when eligibility does not exist', async () => {
      eligibilityRepo.delete.mockResolvedValue({ affected: 0, raw: [] } as DeleteResult);

      await expect(service.deleteEligibility(userId, taskTypeId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEligibleTaskTypesForUser', () => {
    it('should return mapped task types', async () => {
      eligibilityRepo.find.mockResolvedValue([{ id: 'elig-1', tenantId, userId, taskTypeId } as TaskTypeEligibility]);
      taskTypeRepo.find.mockResolvedValue([
        {
          id: taskTypeId,
          tenantId,
          name: 'Editing',
          description: 'Post-production',
          isActive: true,
        } as TaskType,
      ]);

      const result = await service.getEligibleTaskTypesForUser(userId);

      expect(result).toEqual([
        {
          id: taskTypeId,
          name: 'Editing',
          description: 'Post-production',
          isActive: true,
        },
      ]);
    });
  });

  describe('getEligibleStaffForTaskType', () => {
    it('should return eligible staff with profile details', async () => {
      eligibilityRepo.find.mockResolvedValue([{ id: 'elig-1', tenantId, userId, taskTypeId } as TaskTypeEligibility]);
      userRepo.find.mockResolvedValue([{ id: userId, tenantId, email: 'staff@test.com', role: 'FIELD_STAFF' } as User]);
      profileRepo.find.mockResolvedValue([
        { id: 'profile-1', tenantId, userId, firstName: 'Jane', lastName: 'Doe', jobTitle: 'Editor' } as Profile,
      ]);

      const result = await service.getEligibleStaffForTaskType(taskTypeId);

      expect(result).toEqual([
        {
          userId,
          email: 'staff@test.com',
          role: 'FIELD_STAFF',
          profile: {
            firstName: 'Jane',
            lastName: 'Doe',
            jobTitle: 'Editor',
          },
        },
      ]);
    });

    it('should throw NotFoundException when task type does not exist', async () => {
      taskTypeRepo.findOne.mockResolvedValue(null);

      await expect(service.getEligibleStaffForTaskType(taskTypeId)).rejects.toThrow(NotFoundException);
    });
  });
});
