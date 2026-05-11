import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { ProcessingTypeRepository } from '../../bookings/repositories/processing-type.repository';
import { UserRepository } from '../../users/repositories/user.repository';
import {
  CreateProcessingTypeEligibilityDto,
  EligibleProcessingTypeDto,
  EligibleStaffDto,
} from '../dto/processing-type-eligibility.dto';
import { ProcessingTypeEligibility } from '../entities';
import { ProcessingTypeEligibilityRepository } from '../repositories/processing-type-eligibility.repository';
import { ProfileRepository } from '../repositories/profile.repository';

@Injectable()
export class ProcessingTypeEligibilityService {
  constructor(
    private readonly eligibilityRepository: ProcessingTypeEligibilityRepository,
    private readonly processingTypeRepository: ProcessingTypeRepository,
    private readonly userRepository: UserRepository,
    private readonly profileRepository: ProfileRepository,
  ) {}

  async createEligibility(dto: CreateProcessingTypeEligibilityDto): Promise<ProcessingTypeEligibility> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureStaffExists(dto.userId, tenantId);
    await this.ensureProcessingTypeExists(dto.processingTypeId, tenantId);

    const existing = await this.eligibilityRepository.findOne({
      where: {
        tenantId,
        userId: dto.userId,
        processingTypeId: dto.processingTypeId,
      },
    });

    if (existing) {
      throw new ConflictException('hr.processing_type_eligibility_already_exists');
    }

    const eligibility = this.eligibilityRepository.create({
      tenantId,
      userId: dto.userId,
      processingTypeId: dto.processingTypeId,
    });

    return this.eligibilityRepository.save(eligibility);
  }

  async deleteEligibility(userId: string, processingTypeId: string): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureStaffExists(userId, tenantId);
    await this.ensureProcessingTypeExists(processingTypeId, tenantId);

    const result = await this.eligibilityRepository.delete({
      tenantId,
      userId,
      processingTypeId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('hr.processing_type_eligibility_not_found');
    }
  }

  async getEligibleProcessingTypesForUser(userId: string): Promise<EligibleProcessingTypeDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureStaffExists(userId, tenantId);

    const eligibilities = await this.eligibilityRepository.find({
      where: { tenantId, userId },
    });

    if (eligibilities.length === 0) {
      return [];
    }

    const processingTypeIds = eligibilities.map((e) => e.processingTypeId);
    const processingTypes = await this.processingTypeRepository.find({
      where: { tenantId, id: In(processingTypeIds) },
      order: { name: 'ASC' },
    });

    return processingTypes.map((pt) => ({
      id: pt.id,
      name: pt.name,
      description: pt.description,
      isActive: pt.isActive,
      price: Number(pt.price),
    }));
  }

  async getEligibleStaffForProcessingType(processingTypeId: string): Promise<EligibleStaffDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.ensureProcessingTypeExists(processingTypeId, tenantId);

    const eligibilities = await this.eligibilityRepository.find({
      where: { tenantId, processingTypeId },
    });

    if (eligibilities.length === 0) {
      return [];
    }

    const userIds = eligibilities.map((e) => e.userId);
    const users = await this.userRepository.find({
      where: { tenantId, id: In(userIds), deletedAt: IsNull() },
      order: { email: 'ASC' },
    });

    const profiles = await this.profileRepository.find({
      where: { tenantId, userId: In(userIds), deletedAt: IsNull() },
    });

    const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

    return users.map((user) => {
      const profile = profileByUserId.get(user.id);
      return {
        userId: user.id,
        email: user.email,
        role: user.role,
        profile: profile
          ? { firstName: profile.firstName, lastName: profile.lastName, jobTitle: profile.jobTitle }
          : null,
      };
    });
  }

  private async ensureStaffExists(userId: string, tenantId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId, deletedAt: IsNull() },
    });
    if (!user) throw new NotFoundException('hr.user_not_found_in_tenant');

    const profile = await this.profileRepository.findOne({
      where: { userId, tenantId, deletedAt: IsNull() },
    });
    if (!profile) throw new NotFoundException('hr.profile_not_found_in_tenant');
  }

  private async ensureProcessingTypeExists(processingTypeId: string, tenantId: string): Promise<void> {
    const pt = await this.processingTypeRepository.findOne({
      where: { id: processingTypeId, tenantId },
    });
    if (!pt) throw new NotFoundException('hr.processing_type_not_found_in_tenant');
  }
}
