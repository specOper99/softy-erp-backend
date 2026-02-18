import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TaskType } from '../../catalog/entities/task-type.entity';
import { User } from '../../users/entities/user.entity';
import { CreateTaskTypeEligibilityDto, EligibleStaffDto, EligibleTaskTypeDto } from '../dto/task-type-eligibility.dto';
import { Profile, TaskTypeEligibility } from '../entities';

@Injectable()
export class TaskTypeEligibilityService {
  constructor(
    @InjectRepository(TaskTypeEligibility)
    private readonly taskTypeEligibilityRepository: Repository<TaskTypeEligibility>,
    @InjectRepository(TaskType)
    private readonly taskTypeRepository: Repository<TaskType>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  async createEligibility(dto: CreateTaskTypeEligibilityDto): Promise<TaskTypeEligibility> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureStaffExists(dto.userId, tenantId);
    await this.ensureTaskTypeExists(dto.taskTypeId, tenantId);

    const existing = await this.taskTypeEligibilityRepository.findOne({
      where: {
        tenantId,
        userId: dto.userId,
        taskTypeId: dto.taskTypeId,
      },
    });

    if (existing) {
      throw new ConflictException('hr.task_type_eligibility_already_exists');
    }

    const eligibility = this.taskTypeEligibilityRepository.create({
      tenantId,
      userId: dto.userId,
      taskTypeId: dto.taskTypeId,
    });

    return this.taskTypeEligibilityRepository.save(eligibility);
  }

  async deleteEligibility(userId: string, taskTypeId: string): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureStaffExists(userId, tenantId);
    await this.ensureTaskTypeExists(taskTypeId, tenantId);

    const result = await this.taskTypeEligibilityRepository.delete({
      tenantId,
      userId,
      taskTypeId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('hr.task_type_eligibility_not_found');
    }
  }

  async getEligibleTaskTypesForUser(userId: string): Promise<EligibleTaskTypeDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureStaffExists(userId, tenantId);

    const eligibilities = await this.taskTypeEligibilityRepository.find({
      where: {
        tenantId,
        userId,
      },
    });

    if (eligibilities.length === 0) {
      return [];
    }

    const taskTypeIds = eligibilities.map((eligibility) => eligibility.taskTypeId);
    const taskTypes = await this.taskTypeRepository.find({
      where: {
        tenantId,
        id: In(taskTypeIds),
      },
      order: {
        name: 'ASC',
      },
    });

    return taskTypes.map((taskType) => ({
      id: taskType.id,
      name: taskType.name,
      description: taskType.description,
      isActive: taskType.isActive,
    }));
  }

  async getEligibleStaffForTaskType(taskTypeId: string): Promise<EligibleStaffDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureTaskTypeExists(taskTypeId, tenantId);

    const eligibilities = await this.taskTypeEligibilityRepository.find({
      where: {
        tenantId,
        taskTypeId,
      },
    });

    if (eligibilities.length === 0) {
      return [];
    }

    const userIds = eligibilities.map((eligibility) => eligibility.userId);
    const users = await this.userRepository.find({
      where: {
        tenantId,
        id: In(userIds),
        deletedAt: IsNull(),
      },
      order: {
        email: 'ASC',
      },
    });

    const profiles = await this.profileRepository.find({
      where: {
        tenantId,
        userId: In(userIds),
        deletedAt: IsNull(),
      },
    });

    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));

    return users.map((user) => {
      const profile = profileByUserId.get(user.id);

      return {
        userId: user.id,
        email: user.email,
        role: user.role,
        profile: profile
          ? {
              firstName: profile.firstName,
              lastName: profile.lastName,
              jobTitle: profile.jobTitle,
            }
          : null,
      };
    });
  }

  private async ensureStaffExists(userId: string, tenantId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        tenantId,
        deletedAt: IsNull(),
      },
    });

    if (!user) {
      throw new NotFoundException('hr.user_not_found_in_tenant');
    }

    const profile = await this.profileRepository.findOne({
      where: {
        userId,
        tenantId,
        deletedAt: IsNull(),
      },
    });

    if (!profile) {
      throw new NotFoundException('hr.profile_not_found_in_tenant');
    }
  }

  private async ensureTaskTypeExists(taskTypeId: string, tenantId: string): Promise<void> {
    const taskType = await this.taskTypeRepository.findOne({
      where: {
        id: taskTypeId,
        tenantId,
      },
    });

    if (!taskType) {
      throw new NotFoundException('hr.task_type_not_found_in_tenant');
    }
  }
}
