import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual, Raw, Repository } from 'typeorm';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { parseDateOnlyToUtc, toUtcDayRange } from '../../bookings/utils/booking-date-policy.util';
import { PackageItem } from '../../catalog/entities/package-item.entity';
import { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import { StaffAvailabilitySlotRepository } from '../../hr/repositories/staff-availability-slot.repository';
import { TaskTypeEligibilityRepository } from '../../hr/repositories/task-type-eligibility.repository';
import { Tenant } from '../../tenants/entities/tenant.entity';

type WorkingHoursArray = Array<{ day: string; startTime: string; endTime: string; isOpen: boolean }>;
type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type WorkingHoursMap = Partial<Record<Weekday, { start: string; end: string; enabled: boolean }>>;

/** Parse "HH:mm" into total minutes since midnight */
function toMin(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  capacity: number;
  booked: number;
}

export interface AvailabilityResponse {
  available: boolean;
  date: string;
  timeSlots: TimeSlot[];
  nextAvailableDate?: string | null;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly availabilityCacheOwner: AvailabilityCacheOwnerService,
    private readonly bookingRepository: BookingRepository,
    private readonly packageRepository: ServicePackageRepository,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly staffSlotRepo: StaffAvailabilitySlotRepository,
    private readonly eligibilityRepo: TaskTypeEligibilityRepository,
    @InjectRepository(PackageItem)
    private readonly packageItemRepo: Repository<PackageItem>,
  ) {}

  async checkAvailability(tenantId: string, packageId: string, date: string): Promise<AvailabilityResponse> {
    return TenantContextService.run(tenantId, async () => {
      // Check cache first
      const cached = await this.availabilityCacheOwner.getAvailability<AvailabilityResponse>(tenantId, packageId, date);
      if (cached) {
        return cached;
      }

      const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
      if (!tenant) {
        throw new NotFoundException('tenants.not_found');
      }

      const servicePackage = await this.packageRepository.findOne({ where: { id: packageId } });
      if (!servicePackage) {
        throw new NotFoundException('client_portal.package_not_found');
      }

      const targetDate = parseDateOnlyToUtc(date);
      const dayRange = toUtcDayRange(targetDate);

      // Validate date is within booking window
      const now = new Date();
      const minNoticeDays = (tenant.minimumNoticePeriodHours ?? 24) / 24;
      const minDate = new Date(now.getTime() + minNoticeDays * 24 * 60 * 60 * 1000);
      const maxDate = new Date(now.getTime() + (tenant.maxAdvanceBookingDays ?? 90) * 24 * 60 * 60 * 1000);

      if (targetDate < minDate || targetDate > maxDate) {
        const response: AvailabilityResponse = {
          available: false,
          date,
          timeSlots: [],
        };
        await this.availabilityCacheOwner.setAvailability(tenantId, packageId, date, response);
        return response;
      }

      const utcDayOfWeek = targetDate.getUTCDay();
      const dateOnly = new Date(
        Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()),
      );

      // ── Resolve staff schedules for this package/date ────────────────────
      // 1. Find which task types are required by this package
      const packageItems = await this.packageItemRepo.find({ where: { packageId } });
      const taskTypeIds = [...new Set(packageItems.map((i) => i.taskTypeId))];

      let timeSlots: TimeSlot[] = [];
      let hasStaffSlots = false;

      if (taskTypeIds.length > 0) {
        // 2. Find all eligible (active) staff user IDs for those task types
        const eligibilities = await this.eligibilityRepo.find({
          where: { taskTypeId: In(taskTypeIds) },
          select: { userId: true },
        });
        const eligibleUserIds = [...new Set(eligibilities.map((e) => e.userId))];

        if (eligibleUserIds.length > 0) {
          // 3. Load active availability slots for eligible staff on this day
          const staffSlots = await this.staffSlotRepo.find({
            where: [
              {
                userId: In(eligibleUserIds),
                dayOfWeek: utcDayOfWeek,
                effectiveFrom: LessThanOrEqual(dateOnly),
                effectiveTo: IsNull(),
              },
              {
                userId: In(eligibleUserIds),
                dayOfWeek: utcDayOfWeek,
                effectiveFrom: LessThanOrEqual(dateOnly),
                effectiveTo: MoreThanOrEqual(dateOnly),
              },
            ],
          });

          hasStaffSlots = staffSlots.length > 0;

          if (hasStaffSlots) {
            // 4. Build the set of candidate time windows from slot union, at slot-duration increments
            const slotDuration = servicePackage.durationMinutes;
            const stepMinutes = tenant.timeSlotDurationMinutes ?? 60;
            const requiredStaff = servicePackage.requiredStaffCount ?? 1;

            // Determine overall time range covered by any staff slot
            const minStart = Math.min(...staffSlots.map((s) => toMin(s.startTime)));
            const maxEnd = Math.max(...staffSlots.map((s) => toMin(s.endTime)));

            // Fetch confirmed bookings for the day to compute slot load
            const bookings = await this.bookingRepository.find({
              where: {
                packageId,
                eventDate: Raw((alias) => `${alias} >= :start AND ${alias} < :end`, {
                  start: dayRange.dayStart,
                  end: dayRange.dayEnd,
                }),
                status: BookingStatus.CONFIRMED,
              },
              select: ['startTime'],
            });
            const bookingCounts = new Map<string, number>();
            for (const b of bookings) {
              if (b.startTime) bookingCounts.set(b.startTime, (bookingCounts.get(b.startTime) ?? 0) + 1);
            }

            // Generate candidate slots
            for (let startMin = minStart; startMin + slotDuration <= maxEnd; startMin += stepMinutes) {
              const endMin = startMin + slotDuration;
              const startStr = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
              const endStr = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

              // Count staff whose slot fully covers this candidate window
              const coveringStaff = staffSlots.filter(
                (s) => toMin(s.startTime) <= startMin && toMin(s.endTime) >= endMin,
              );
              // Subtract booked bookings in this slot from the covering staff count
              const bookedCount = bookingCounts.get(startStr) ?? 0;
              const freeStaff = Math.max(0, coveringStaff.length - bookedCount);
              const available = freeStaff >= requiredStaff;

              timeSlots.push({
                start: startStr,
                end: endStr,
                available,
                capacity: Math.max(0, coveringStaff.length - requiredStaff + 1 - bookedCount),
                booked: bookedCount,
              });
            }
          }
        }
      }

      // ── Fallback: use tenant working hours when no staff slots configured ──
      if (!hasStaffSlots) {
        const daysOfWeekNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = daysOfWeekNames[utcDayOfWeek];

        let normalized: { enabled: boolean; start: string; end: string } | null = null;
        const wh = tenant.workingHours as WorkingHoursArray | WorkingHoursMap | null;
        if (Array.isArray(wh)) {
          const entry = wh.find((e) => (e.day || '').toLowerCase() === dayName);
          if (entry) normalized = { enabled: Boolean(entry.isOpen), start: entry.startTime, end: entry.endTime };
        } else if (wh && typeof wh === 'object') {
          const dayObj = wh[dayName as Weekday];
          if (dayObj) normalized = { enabled: Boolean(dayObj.enabled), start: dayObj.start, end: dayObj.end };
        }

        if (!normalized || !normalized.enabled) {
          const response: AvailabilityResponse = { available: false, date, timeSlots: [] };
          await this.availabilityCacheOwner.setAvailability(tenantId, packageId, date, response);
          return response;
        }

        timeSlots = this.generateTimeSlots(
          normalized.start,
          normalized.end,
          tenant.timeSlotDurationMinutes ?? 60,
          servicePackage.durationMinutes,
        );

        const bookings = await this.bookingRepository.find({
          where: {
            packageId,
            eventDate: Raw((alias) => `${alias} >= :targetDate AND ${alias} < :nextDayDate`, {
              targetDate: dayRange.dayStart,
              nextDayDate: dayRange.dayEnd,
            }),
            status: BookingStatus.CONFIRMED,
          },
          select: ['startTime', 'eventDate'],
        });

        const bookingCounts = new Map<string, number>();
        bookings.forEach((booking) => {
          if (booking.startTime) {
            bookingCounts.set(booking.startTime, (bookingCounts.get(booking.startTime) || 0) + 1);
          }
        });

        const maxConcurrent = tenant.maxConcurrentBookingsPerSlot ?? 1;
        timeSlots.forEach((slot) => {
          const booked = bookingCounts.get(slot.start) || 0;
          slot.booked = booked;
          slot.capacity = maxConcurrent - booked;
          slot.available = slot.capacity > 0;
        });
      }

      const hasAvailableSlot = timeSlots.some((s) => s.available);

      const response: AvailabilityResponse = {
        available: hasAvailableSlot,
        date,
        timeSlots,
      };

      await this.availabilityCacheOwner.setAvailability(tenantId, packageId, date, response);

      return response;
    });
  }

  async findNextAvailableDate(tenantId: string, packageId: string, fromDate: string): Promise<string | null> {
    return TenantContextService.run(tenantId, async () => {
      const startDate = parseDateOnlyToUtc(fromDate);

      const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
      if (!tenant) {
        return null;
      }

      const maxDays = tenant.maxAdvanceBookingDays ?? 90;

      for (let i = 0; i < maxDays; i++) {
        const checkDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStrFull = checkDate.toISOString().split('T')[0];
        if (!dateStrFull) continue;

        const availability = await this.checkAvailability(tenantId, packageId, dateStrFull);

        if (availability.available) {
          return dateStrFull;
        }
      }

      return null;
    });
  }

  async invalidateAvailabilityCache(tenantId: string, packageId: string, date: string): Promise<void> {
    await this.availabilityCacheOwner.delAvailability(tenantId, packageId, date);
  }

  private generateTimeSlots(
    startTime: string,
    endTime: string,
    slotDurationMinutes: number,
    bookingDurationMinutes: number,
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Parse UTC times
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);
    const bookingMinutes = bookingDurationMinutes;

    // Generate slots where booking can fit
    for (let minutes = startMinutes; minutes <= endMinutes - bookingMinutes; minutes += slotDurationMinutes) {
      const slotStart = this.minutesToTime(minutes);
      const slotEnd = this.minutesToTime(minutes + bookingMinutes);

      slots.push({
        start: slotStart,
        end: slotEnd,
        available: false,
        capacity: 0,
        booked: 0,
      });
    }

    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours = 0, minutes = 0] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
