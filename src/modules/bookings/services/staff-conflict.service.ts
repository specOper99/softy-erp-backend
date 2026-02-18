import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { PackageItem } from '../../catalog/entities/package-item.entity';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { TaskTypeEligibility } from '../../hr/entities/task-type-eligibility.entity';
import { TaskAssignee } from '../../tasks/entities/task-assignee.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { computeBookingWindow, windowsOverlap } from '../utils/booking-window.util';

interface CheckPackageStaffAvailabilityInput {
  packageId: string;
  eventDate: Date;
  startTime: string;
  durationMinutes?: number;
  excludeBookingId?: string;
}

interface StaffAvailabilityResult {
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
    @InjectRepository(ServicePackage)
    private readonly servicePackageRepository: Repository<ServicePackage>,
    @InjectRepository(PackageItem)
    private readonly packageItemRepository: Repository<PackageItem>,
    @InjectRepository(TaskTypeEligibility)
    private readonly taskTypeEligibilityRepository: Repository<TaskTypeEligibility>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TaskAssignee)
    private readonly taskAssigneeRepository: Repository<TaskAssignee>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async checkPackageStaffAvailability(input: CheckPackageStaffAvailabilityInput): Promise<StaffAvailabilityResult> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const servicePackage = await this.servicePackageRepository.findOne({
      where: {
        id: input.packageId,
        tenantId,
      },
    });

    if (!servicePackage) {
      throw new NotFoundException('catalog.package_not_found_in_tenant');
    }

    const requiredStaffCount = servicePackage.requiredStaffCount;
    const durationMinutes = input.durationMinutes ?? servicePackage.durationMinutes;
    const requestedWindow = computeBookingWindow(input.eventDate, input.startTime, durationMinutes);

    const packageTaskTypeIds = await this.getPackageTaskTypeIds(tenantId, input.packageId);
    const eligibleUserIds = await this.getEligibleActiveUserIds(tenantId, packageTaskTypeIds);
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

    const busyUserIds = await this.getBusyEligibleUserIds(
      tenantId,
      eligibleUserIds,
      requestedWindow,
      input.excludeBookingId,
    );
    const busyCount = busyUserIds.size;
    const availableCount = Math.max(0, eligibleCount - busyCount);

    return {
      ok: availableCount >= requiredStaffCount,
      requiredStaffCount,
      eligibleCount,
      busyCount,
      availableCount,
    };
  }

  private async getPackageTaskTypeIds(tenantId: string, packageId: string): Promise<string[]> {
    const packageItems = await this.packageItemRepository.find({
      where: {
        tenantId,
        packageId,
      },
      select: {
        taskTypeId: true,
      },
    });

    return Array.from(new Set(packageItems.map((item) => item.taskTypeId)));
  }

  private async getEligibleActiveUserIds(tenantId: string, packageTaskTypeIds: string[]): Promise<string[]> {
    if (packageTaskTypeIds.length === 0) {
      return [];
    }

    const eligibilities = await this.taskTypeEligibilityRepository.find({
      where: {
        tenantId,
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
        tenantId,
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

  private async getBusyEligibleUserIds(
    tenantId: string,
    eligibleUserIds: string[],
    requestedWindow: { start: Date; end: Date },
    excludeBookingId?: string,
  ): Promise<Set<string>> {
    if (eligibleUserIds.length === 0) {
      return new Set();
    }

    const [taskAssigneeAssignments, legacyAssignments] = await Promise.all([
      this.getTaskAssigneeAssignments(tenantId, eligibleUserIds, excludeBookingId),
      this.getLegacyAssignments(tenantId, eligibleUserIds, excludeBookingId),
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
    tenantId: string,
    eligibleUserIds: string[],
    excludeBookingId?: string,
  ): Promise<BusyAssignmentRecord[]> {
    const query = this.taskAssigneeRepository
      .createQueryBuilder('taskAssignee')
      .innerJoin(Task, 'task', 'task.id = taskAssignee.taskId AND task.tenantId = :tenantId', { tenantId })
      .innerJoin(Booking, 'booking', 'booking.id = task.bookingId AND booking.tenantId = :tenantId', { tenantId })
      .where('taskAssignee.tenantId = :tenantId', { tenantId })
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

  private getLegacyAssignments(
    tenantId: string,
    eligibleUserIds: string[],
    excludeBookingId?: string,
  ): Promise<BusyAssignmentRecord[]> {
    const query = this.taskRepository
      .createQueryBuilder('task')
      .innerJoin(Booking, 'booking', 'booking.id = task.bookingId AND booking.tenantId = :tenantId', { tenantId })
      .where('task.tenantId = :tenantId', { tenantId })
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
