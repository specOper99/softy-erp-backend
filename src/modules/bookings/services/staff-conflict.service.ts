import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { PackageItemRepository } from '../../catalog/repositories/package-item.repository';
import { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import { StaffAvailabilitySlot } from '../../hr/entities/staff-availability-slot.entity';
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
    @InjectRepository(StaffAvailabilitySlot)
    private readonly availabilitySlotRepo: Repository<StaffAvailabilitySlot>,
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
    const scheduledUserIds = await this.getScheduledUserIds(eligibleUserIds, input.eventDate, requestedWindow);
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
   * target day-of-week that covers the full booking time window.
   * Falls back to returning all eligibleUserIds when no slots are configured (tenant
   * has not yet set up staff schedules), maintaining backward compatibility.
   */
  private async getScheduledUserIds(
    eligibleUserIds: string[],
    eventDate: Date,
    requestedWindow: { start: Date; end: Date },
  ): Promise<string[]> {
    if (eligibleUserIds.length === 0) return [];

    const dayOfWeek = eventDate.getUTCDay();
    const eventDateOnly = new Date(
      Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()),
    );

    // Find slots for eligible staff on the matching day that are active for eventDate
    const slots = await this.availabilitySlotRepo.find({
      where: [
        // Slots with no end date (open-ended)
        {
          userId: In(eligibleUserIds),
          dayOfWeek,
          effectiveFrom: LessThanOrEqual(eventDateOnly),
          effectiveTo: IsNull(),
        },
        // Slots with an explicit end date
        {
          userId: In(eligibleUserIds),
          dayOfWeek,
          effectiveFrom: LessThanOrEqual(eventDateOnly),
          effectiveTo: MoreThanOrEqual(eventDateOnly),
        },
      ],
    });

    // If no slots are configured at all for any eligible staff, fall back to legacy
    // behaviour (schedule-unaware) so tenants without slot data are not broken.
    if (slots.length === 0) {
      return eligibleUserIds;
    }

    // Request window minutes relative to day start
    const reqStartMin = toMinutes(
      `${String(requestedWindow.start.getUTCHours()).padStart(2, '0')}:${String(requestedWindow.start.getUTCMinutes()).padStart(2, '0')}`,
    );
    const reqEndMin = toMinutes(
      `${String(requestedWindow.end.getUTCHours()).padStart(2, '0')}:${String(requestedWindow.end.getUTCMinutes()).padStart(2, '0')}`,
    );

    // A staff member is "scheduled" if any of their slots fully covers the booking window
    const scheduledSet = new Set<string>();
    for (const slot of slots) {
      if (toMinutes(slot.startTime) <= reqStartMin && toMinutes(slot.endTime) >= reqEndMin) {
        scheduledSet.add(slot.userId);
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
