import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TENANT_REPO_STAFF_AVAILABILITY } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import {
  CreateStaffAvailabilitySlotDto,
  ListStaffAvailabilitySlotsDto,
  UpdateStaffAvailabilitySlotDto,
} from '../dto/staff-availability-slot.dto';
import { StaffAvailabilitySlot } from '../entities/staff-availability-slot.entity';

/** Parse "HH:mm" into total minutes since midnight for ordering/comparison */
function toMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

@Injectable()
export class StaffAvailabilitySlotService {
  constructor(
    @Inject(TENANT_REPO_STAFF_AVAILABILITY)
    private readonly repo: TenantAwareRepository<StaffAvailabilitySlot>,
  ) {}

  async create(dto: CreateStaffAvailabilitySlotDto): Promise<StaffAvailabilitySlot> {
    this.validateTimeRange(dto.startTime, dto.endTime);

    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new BadRequestException('hr.availability_slot_effective_to_before_from');
    }

    const slot = this.repo.create({
      userId: dto.userId,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isRecurring: dto.isRecurring ?? true,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
    });

    return this.repo.save(slot);
  }

  async findAll(query: ListStaffAvailabilitySlotsDto, scopedUserId?: string): Promise<StaffAvailabilitySlot[]> {
    const userId = scopedUserId ?? query.userId;
    return this.repo.find({
      where: userId ? { userId } : {},
      order: { userId: 'ASC', dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async findOne(id: string): Promise<StaffAvailabilitySlot> {
    const slot = await this.repo.findOne({ where: { id } });
    if (!slot) {
      throw new NotFoundException('hr.availability_slot_not_found');
    }
    return slot;
  }

  async update(id: string, dto: UpdateStaffAvailabilitySlotDto): Promise<StaffAvailabilitySlot> {
    const slot = await this.findOne(id);

    const nextStartTime = dto.startTime ?? slot.startTime;
    const nextEndTime = dto.endTime ?? slot.endTime;
    this.validateTimeRange(nextStartTime, nextEndTime);

    if (dto.dayOfWeek !== undefined) slot.dayOfWeek = dto.dayOfWeek;
    if (dto.startTime !== undefined) slot.startTime = dto.startTime;
    if (dto.endTime !== undefined) slot.endTime = dto.endTime;
    if (dto.isRecurring !== undefined) slot.isRecurring = dto.isRecurring;
    if (dto.effectiveFrom !== undefined) slot.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined) slot.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    const effectiveFrom = slot.effectiveFrom;
    const effectiveTo = slot.effectiveTo;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('hr.availability_slot_effective_to_before_from');
    }

    return this.repo.save(slot);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('hr.availability_slot_not_found');
    }
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      throw new BadRequestException('hr.availability_slot_start_must_be_before_end');
    }
  }
}
