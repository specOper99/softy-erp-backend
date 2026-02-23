import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { AvailabilityService } from './availability.service';
import type { Booking } from '../../bookings/entities/booking.entity';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import type { ServicePackage } from '../../catalog/entities/service-package.entity';
import { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Helper to generate relative dates for stable tests.
 * Uses a fixed offset (5 days) from now to ensure we're within the booking window
 * while avoiding edge cases around midnight.
 */
function getTestDate(daysOffset: number): { dateString: string; dateObj: Date } {
  const now = new Date();
  // Use UTC to avoid timezone issues
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysOffset, 0, 0, 0));
  const dateString = target.toISOString().split('T')[0] as string;
  return { dateString, dateObj: target };
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let bookingRepository: { find: jest.Mock };
  let packageRepository: { findOne: jest.Mock };
  let tenantRepository: Repository<Tenant>;

  const bookingRepositoryMock = { find: jest.fn() };
  const packageRepositoryMock = { findOne: jest.fn() };

  const mockTenant: Partial<Tenant> = {
    id: 'tenant-1',
    minimumNoticePeriodHours: 24,
    maxAdvanceBookingDays: 90,
    // for these tests we don't care about weekends so simplify every day to
    // a standard 09:00–17:00 schedule. this makes slot calculations stable
    // regardless of when the test runs.
    workingHours: [
      { day: 'monday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'tuesday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'wednesday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'thursday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'friday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'saturday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'sunday', startTime: '09:00', endTime: '17:00', isOpen: true },
    ],
    timeSlotDurationMinutes: 60,
    defaultBookingDurationHours: 2,
    maxConcurrentBookingsPerSlot: 1,
  };

  const mockPackage: Partial<ServicePackage> = {
    id: 'package-1',
    tenantId: 'tenant-1',
    name: 'Test Package',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: AvailabilityCacheOwnerService,
          useValue: {
            getAvailability: jest.fn().mockResolvedValue(undefined),
            setAvailability: jest.fn().mockResolvedValue(undefined),
            delAvailability: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: BookingRepository, useValue: bookingRepositoryMock },
        { provide: ServicePackageRepository, useValue: packageRepositoryMock },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    bookingRepository = module.get<{ find: jest.Mock }>(BookingRepository);
    packageRepository = module.get<{ findOne: jest.Mock }>(ServicePackageRepository);
    tenantRepository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAvailability date range filtering', () => {
    const baseDate = getTestDate(5);
    const nextDate = getTestDate(6);

    it('should count booking on base date at 10:00 for base date', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      packageRepository.findOne.mockResolvedValue(mockPackage as ServicePackage);
      bookingRepository.find.mockResolvedValue([
        {
          id: 'booking-1',
          tenantId: 'tenant-1',
          packageId: 'package-1',
          eventDate: new Date(`${baseDate.dateString}T10:00:00Z`),
          startTime: '10:00',
          status: BookingStatus.CONFIRMED,
        },
      ] as Booking[]);

      const result = await service.checkAvailability('tenant-1', 'package-1', baseDate.dateString);

      expect(bookingRepository.find).toHaveBeenCalled();
      expect(result.timeSlots).toHaveLength(7);
      const tenOClockSlot = result.timeSlots.find((s) => s.start === '10:00');
      expect(tenOClockSlot?.booked).toBe(1);
    });

    it('should NOT count booking on next day at 00:30 for base date', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      packageRepository.findOne.mockResolvedValue(mockPackage as ServicePackage);
      bookingRepository.find.mockResolvedValue([
        {
          id: 'booking-2',
          tenantId: 'tenant-1',
          packageId: 'package-1',
          eventDate: new Date(`${nextDate.dateString}T00:30:00Z`),
          startTime: '00:30',
          status: BookingStatus.CONFIRMED,
        },
      ] as Booking[]);

      const result = await service.checkAvailability('tenant-1', 'package-1', baseDate.dateString);

      expect(bookingRepository.find).toHaveBeenCalled();
      expect(result.timeSlots).toHaveLength(7);
      expect(result.timeSlots.every((s) => s.booked === 0)).toBe(true);
    });

    it('should count booking exactly at midnight for base date', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      packageRepository.findOne.mockResolvedValue(mockPackage as ServicePackage);
      bookingRepository.find.mockResolvedValue([
        {
          id: 'booking-3',
          tenantId: 'tenant-1',
          packageId: 'package-1',
          eventDate: new Date(`${baseDate.dateString}T00:00:00Z`),
          startTime: '09:00',
          status: BookingStatus.CONFIRMED,
        },
      ] as Booking[]);

      const result = await service.checkAvailability('tenant-1', 'package-1', baseDate.dateString);

      expect(result.timeSlots).toHaveLength(7);
      const nineOClockSlot = result.timeSlots.find((s) => s.start === '09:00');
      expect(nineOClockSlot?.booked).toBe(1);
    });
  });
});
