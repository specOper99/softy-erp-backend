import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import { Tenant } from '../../tenants/entities/tenant.entity';

type WorkingHoursArray = Array<{ day: string; startTime: string; endTime: string; isOpen: boolean }>;
type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type WorkingHoursMap = Partial<Record<Weekday, { start: string; end: string; enabled: boolean }>>;

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
        throw new Error('Tenant not found');
      }

      const servicePackage = await this.packageRepository.findOne({ where: { id: packageId } });
      if (!servicePackage) {
        throw new Error('Package not found');
      }

      // Parse date (YYYY-MM-DD)
      const [yearStr, monthStr, dayStr] = date.split('-');
      const year = parseInt(yearStr || '0', 10);
      const month = parseInt(monthStr || '0', 10);
      const day = parseInt(dayStr || '0', 10);
      const targetDate = new Date(Date.UTC(year, month - 1, day));
      // Start of next day for range query (exclusive upper bound)
      const nextDayDate = new Date(Date.UTC(year, month - 1, day + 1));

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

      // Get working hours for day of week (support both array and map shapes)
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = daysOfWeek[targetDate.getUTCDay()];

      // Normalize working hours to a consistent shape { enabled, start, end }
      let normalized: { enabled: boolean; start: string; end: string } | null = null;

      const wh = tenant.workingHours as WorkingHoursArray | WorkingHoursMap | null;
      if (Array.isArray(wh)) {
        const entry = wh.find((e) => (e.day || '').toLowerCase() === dayOfWeek);
        if (entry) {
          normalized = {
            enabled: Boolean(entry.isOpen),
            start: entry.startTime,
            end: entry.endTime,
          };
        }
      } else if (wh && typeof wh === 'object') {
        const dayObj = wh[dayOfWeek as Weekday];
        if (dayObj) {
          normalized = {
            enabled: Boolean(dayObj.enabled),
            start: dayObj.start,
            end: dayObj.end,
          };
        }
      }

      if (!normalized || !normalized.enabled) {
        const response: AvailabilityResponse = {
          available: false,
          date,
          timeSlots: [],
        };
        await this.availabilityCacheOwner.setAvailability(tenantId, packageId, date, response);
        return response;
      }

      // Generate time slots
      const timeSlots = this.generateTimeSlots(
        normalized.start,
        normalized.end,
        tenant.timeSlotDurationMinutes ?? 60,
        tenant.defaultBookingDurationHours ?? 2,
      );

      const bookings = await this.bookingRepository.find({
        where: {
          packageId,
          eventDate: Raw((alias) => `${alias} >= :targetDate AND ${alias} < :nextDayDate`, { targetDate, nextDayDate }),
          status: BookingStatus.CONFIRMED,
        },
        select: ['startTime', 'eventDate'],
      });

      // Count bookings per slot
      const bookingCounts = new Map<string, number>();
      bookings.forEach((booking) => {
        if (booking.startTime) {
          bookingCounts.set(booking.startTime, (bookingCounts.get(booking.startTime) || 0) + 1);
        }
      });

      // Mark availability
      const maxConcurrent = tenant.maxConcurrentBookingsPerSlot ?? 1;
      let hasAvailableSlot = false;

      timeSlots.forEach((slot) => {
        const booked = bookingCounts.get(slot.start) || 0;
        slot.booked = booked;
        slot.capacity = maxConcurrent - booked;
        slot.available = slot.capacity > 0;
        if (slot.available) {
          hasAvailableSlot = true;
        }
      });

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
      const [yearStr, monthStr, dayStr] = fromDate.split('-');
      const year = parseInt(yearStr || '0', 10);
      const month = parseInt(monthStr || '0', 10);
      const day = parseInt(dayStr || '0', 10);
      const startDate = new Date(Date.UTC(year, month - 1, day));

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
    bookingDurationHours: number,
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Parse UTC times
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);
    const bookingMinutes = bookingDurationHours * 60;

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
