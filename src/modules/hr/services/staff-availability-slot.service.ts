import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Not } from 'typeorm';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { TENANT_REPO_STAFF_AVAILABILITY } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TenantContextService } from '../../../common/services/tenant-context.service';
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

/** True if two [startA,endA) and [startB,endB) time windows overlap (in minutes) */
function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

/** True if two date ranges [fromA, toA] and [fromB, toB] overlap (toX=null means open-ended) */
function dateRangesOverlap(fromA: Date, toA: Date | null, fromB: Date, toB: Date | null): boolean {
  const aEnd = toA ?? new Date('9999-12-31');
  const bEnd = toB ?? new Date('9999-12-31');
  return fromA <= bEnd && fromB <= aEnd;
}

@Injectable()
export class StaffAvailabilitySlotService {
  constructor(
    @Inject(TENANT_REPO_STAFF_AVAILABILITY)
    private readonly repo: TenantAwareRepository<StaffAvailabilitySlot>,
    private readonly availabilityCacheOwner: AvailabilityCacheOwnerService,
  ) {}

  async create(dto: CreateStaffAvailabilitySlotDto): Promise<StaffAvailabilitySlot> {
    this.validateTimeRange(dto.startTime, dto.endTime);

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('hr.availability_slot_effective_to_before_from');
    }

    await this.assertNoOverlap(dto.userId, dto.dayOfWeek, dto.startTime, dto.endTime, effectiveFrom, effectiveTo);

    const slot = this.repo.create({
      userId: dto.userId,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isRecurring: dto.isRecurring ?? true,
      effectiveFrom,
      effectiveTo,
    });

    const saved = await this.repo.save(slot);
    await this.invalidateTenantCache();
    return saved;
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

    await this.assertNoOverlap(
      slot.userId,
      slot.dayOfWeek,
      slot.startTime,
      slot.endTime,
      effectiveFrom,
      effectiveTo,
      id,
    );

    const saved = await this.repo.save(slot);
    await this.invalidateTenantCache();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('hr.availability_slot_not_found');
    }
    await this.invalidateTenantCache();
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      throw new BadRequestException('hr.availability_slot_start_must_be_before_end');
    }
  }

  /**
   * Ensure no existing slot for the same user/day overlaps in both time AND date ranges.
   * @param excludeId – the slot being updated (skip self-comparison)
   */
  private async assertNoOverlap(
    userId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repo.find({
      where: excludeId ? { userId, dayOfWeek, id: Not(excludeId) } : { userId, dayOfWeek },
    });

    for (const slot of existing) {
      if (
        timesOverlap(startTime, endTime, slot.startTime, slot.endTime) &&
        dateRangesOverlap(effectiveFrom, effectiveTo, slot.effectiveFrom, slot.effectiveTo)
      ) {
        throw new BadRequestException('hr.availability_slot_overlap');
      }
    }
  }

  private async invalidateTenantCache(): Promise<void> {
    const tenantId = TenantContextService.getTenantId();
    if (tenantId) {
      await this.availabilityCacheOwner.delAvailabilityForTenant(tenantId);
    }
  }
}
