import { Injectable, NotFoundException } from '@nestjs/common';
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { PackageItemRepository } from '../../catalog/repositories/package-item.repository';
import { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import { StaffAvailabilitySlotRepository } from '../../hr/repositories/staff-availability-slot.repository';
import { TaskTypeEligibilityRepository } from '../../hr/repositories/task-type-eligibility.repository';
import { Task } from '../../tasks/entities/task.entity';
import { TaskAssigneeRepository } from '../../tasks/repositories/task-assignee.repository';
import { TaskRepository } from '../../tasks/repositories/task.repository';
import { UserRepository } from '../../users/repositories/user.repository';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { computeBookingWindow, windowsOverlap } from '../utils/booking-window.util';

/** Parse "HH:mm" into total minutes since midnight */
function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

interface CheckPackageStaffAvailabilityInput {
  packageId: string;
  eventDate: Date;
  startTime: string;
  durationMinutes?: number;
  excludeBookingId?: string;
}

export interface StaffAvailabilityResult {
  ok: boolean;
  requiredStaffCount: number;
  eligibleCount: number;
  busyCount: number;
  availableCount: number;
}

interface BusyAssignmentRecord {
  userId: string;
  eventDate: Date | string;
  startTime: string;
  durationMinutes: number | string;
}

@Injectable()
export class StaffConflictService {
  constructor(
    private readonly servicePackageRepository: ServicePackageRepository,
    private readonly packageItemRepository: PackageItemRepository,
    private readonly taskTypeEligibilityRepository: TaskTypeEligibilityRepository,
    private readonly userRepository: UserRepository,
    private readonly taskAssigneeRepository: TaskAssigneeRepository,
    private readonly taskRepository: TaskRepository,
    private readonly availabilitySlotRepo: StaffAvailabilitySlotRepository,
  ) {}

  async checkPackageStaffAvailability(input: CheckPackageStaffAvailabilityInput): Promise<StaffAvailabilityResult> {
    const servicePackage = await this.servicePackageRepository.findOne({
      where: {
        id: input.packageId,
      },
    });

    if (!servicePackage) {
      throw new NotFoundException('catalog.package_not_found_in_tenant');
    }

    const requiredStaffCount = servicePackage.requiredStaffCount;
    const durationMinutes = input.durationMinutes ?? servicePackage.durationMinutes;
    const requestedWindow = computeBookingWindow(input.eventDate, input.startTime, durationMinutes);

    const packageTaskTypeIds = await this.getPackageTaskTypeIds(input.packageId);
    const eligibleUserIds = await this.getEligibleActiveUserIds(packageTaskTypeIds);
    const eligibleCount = eligibleUserIds.length;

    if (eligibleCount < requiredStaffCount) {
      return {
        ok: false,
        requiredStaffCount,
        eligibleCount,
        busyCount: 0,
        availableCount: eligibleCount,
      };
    }

    // Further filter to staff who have an active availability slot covering the requested day/time
    const scheduledUserIds = await this.getScheduledUserIds(
      eligibleUserIds,
      input.eventDate,
      input.startTime,
      durationMinutes,
    );
    const scheduledCount = scheduledUserIds.length;

    if (scheduledCount < requiredStaffCount) {
      return {
        ok: false,
        requiredStaffCount,
        eligibleCount: scheduledCount,
        busyCount: 0,
        availableCount: scheduledCount,
      };
    }

    const busyUserIds = await this.getBusyEligibleUserIds(scheduledUserIds, requestedWindow, input.excludeBookingId);
    const busyCount = busyUserIds.size;
    const availableCount = Math.max(0, scheduledCount - busyCount);

    return {
      ok: availableCount >= requiredStaffCount,
      requiredStaffCount,
      eligibleCount: scheduledCount,
      busyCount,
      availableCount,
    };
  }

  private async getPackageTaskTypeIds(packageId: string): Promise<string[]> {
    const packageItems = await this.packageItemRepository.find({
      where: {
        packageId,
      },
      select: {
        taskTypeId: true,
      },
    });

    return Array.from(new Set(packageItems.map((item) => item.taskTypeId)));
  }

  private async getEligibleActiveUserIds(packageTaskTypeIds: string[]): Promise<string[]> {
    if (packageTaskTypeIds.length === 0) {
      return [];
    }

    const eligibilities = await this.taskTypeEligibilityRepository.find({
      where: {
        taskTypeId: In(packageTaskTypeIds),
      },
      select: {
        userId: true,
      },
    });

    const eligibleUserIds = Array.from(new Set(eligibilities.map((eligibility) => eligibility.userId)));

    if (eligibleUserIds.length === 0) {
      return [];
    }

    const activeUsers = await this.userRepository.find({
      where: {
        id: In(eligibleUserIds),
        isActive: true,
        deletedAt: IsNull(),
      },
      select: {
        id: true,
      },
    });

    return activeUsers.map((user) => user.id);
  }

  /**
   * Filter eligible user IDs to those who have an active availability slot on the
   * target day-of-week that fully covers the booking time window.
   *
   * Uses the raw startTime string (e.g. "10:00") and durationMinutes directly so
   * the comparison stays in local-clock minutes and is unaffected by server timezone.
   * Falls back to all eligibleUserIds when no slots are configured (backward-compatible).
   */
  private async getScheduledUserIds(
    eligibleUserIds: string[],
    eventDate: Date,
    startTime: string,
    durationMinutes: number,
  ): Promise<string[]> {
    if (eligibleUserIds.length === 0) return [];

    const dayOfWeek = eventDate.getUTCDay();
    const eventDateOnly = new Date(
      Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()),
    );

    // Find slots for eligible staff on the matching day that are active for eventDate
    const slots = await this.availabilitySlotRepo.find({
      where: [
        // Open-ended slots
        {
          userId: In(eligibleUserIds),
          dayOfWeek,
          effectiveFrom: LessThanOrEqual(eventDateOnly),
          effectiveTo: IsNull(),
        },
        // Bounded slots
        {
          userId: In(eligibleUserIds),
          dayOfWeek,
          effectiveFrom: LessThanOrEqual(eventDateOnly),
          effectiveTo: MoreThanOrEqual(eventDateOnly),
        },
      ],
    });

    // No slots configured at all → fall back to schedule-unaware (legacy) behaviour
    // so tenants that haven't set up staff schedules are not broken.
    if (slots.length === 0) {
      return eligibleUserIds;
    }

    // Compare directly in local-clock minutes — avoids UTC/local mismatch from Date objects
    const reqStartMin = toMinutes(startTime);
    const reqEndMin = reqStartMin + durationMinutes;

    // A staff member is "scheduled" if any of their slots fully covers the booking window.
    // Per-user semantics:
    //   • Has a slot on this day that covers the window → included ✅
    //   • Has a slot on this day that does NOT cover the window → excluded ❌
    //   • Has NO slot on this day at all → included (no restriction configured, legacy) ✅
    const usersWithDaySlots = new Set(slots.map((slot) => slot.userId));
    const scheduledSet = new Set<string>();

    for (const slot of slots) {
      if (toMinutes(slot.startTime) <= reqStartMin && toMinutes(slot.endTime) >= reqEndMin) {
        scheduledSet.add(slot.userId);
      }
    }

    // Users with no slot on this day-of-week are treated as always available (backward-compatible).
    for (const userId of eligibleUserIds) {
      if (!usersWithDaySlots.has(userId)) {
        scheduledSet.add(userId);
      }
    }

    return Array.from(scheduledSet);
  }

  private async getBusyEligibleUserIds(
    eligibleUserIds: string[],
    requestedWindow: { start: Date; end: Date },
    excludeBookingId?: string,
  ): Promise<Set<string>> {
    if (eligibleUserIds.length === 0) {
      return new Set();
    }

    const [taskAssigneeAssignments, legacyAssignments] = await Promise.all([
      this.getTaskAssigneeAssignments(eligibleUserIds, excludeBookingId),
      this.getLegacyAssignments(eligibleUserIds, excludeBookingId),
    ]);

    const busyUserIds = new Set<string>();

    for (const assignment of [...taskAssigneeAssignments, ...legacyAssignments]) {
      const assignmentWindow = computeBookingWindow(
        new Date(assignment.eventDate),
        assignment.startTime,
        Number(assignment.durationMinutes),
      );

      if (windowsOverlap(requestedWindow, assignmentWindow)) {
        busyUserIds.add(assignment.userId);
      }
    }

    return busyUserIds;
  }

  private getTaskAssigneeAssignments(
    eligibleUserIds: string[],
    excludeBookingId?: string,
  ): Promise<BusyAssignmentRecord[]> {
    const query = this.taskAssigneeRepository
      .createQueryBuilder('taskAssignee')
      .innerJoin(Task, 'task', 'task.id = taskAssignee.taskId AND task.tenantId = taskAssignee.tenantId')
      .innerJoin(Booking, 'booking', 'booking.id = task.bookingId AND booking.tenantId = task.tenantId')
      .andWhere('taskAssignee.userId IN (:...eligibleUserIds)', { eligibleUserIds })
      .andWhere('task.deletedAt IS NULL')
      .andWhere('booking.deletedAt IS NULL')
      .andWhere('booking.status = :bookingStatus', { bookingStatus: BookingStatus.CONFIRMED })
      .andWhere('booking.startTime IS NOT NULL')
      .andWhere('booking.durationMinutes > 0')
      .select('taskAssignee.userId', 'userId')
      .addSelect('booking.eventDate', 'eventDate')
      .addSelect('booking.startTime', 'startTime')
      .addSelect('booking.durationMinutes', 'durationMinutes');

    if (excludeBookingId) {
      query.andWhere('booking.id != :excludeBookingId', { excludeBookingId });
    }

    return query.getRawMany<BusyAssignmentRecord>();
  }

  private getLegacyAssignments(eligibleUserIds: string[], excludeBookingId?: string): Promise<BusyAssignmentRecord[]> {
    const query = this.taskRepository
      .createQueryBuilder('task')
      .innerJoin(Booking, 'booking', 'booking.id = task.bookingId AND booking.tenantId = task.tenantId')
      .andWhere('task.assignedUserId IS NOT NULL')
      .andWhere('task.assignedUserId IN (:...eligibleUserIds)', { eligibleUserIds })
      .andWhere('task.deletedAt IS NULL')
      .andWhere('booking.deletedAt IS NULL')
      .andWhere('booking.status = :bookingStatus', { bookingStatus: BookingStatus.CONFIRMED })
      .andWhere('booking.startTime IS NOT NULL')
      .andWhere('booking.durationMinutes > 0')
      .select('task.assignedUserId', 'userId')
      .addSelect('booking.eventDate', 'eventDate')
      .addSelect('booking.startTime', 'startTime')
      .addSelect('booking.durationMinutes', 'durationMinutes');

    if (excludeBookingId) {
      query.andWhere('booking.id != :excludeBookingId', { excludeBookingId });
    }

    return query.getRawMany<BusyAssignmentRecord>();
  }
}
