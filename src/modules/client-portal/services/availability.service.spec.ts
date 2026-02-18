import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilityService } from './availability.service';
import { Booking } from '../../bookings/entities/booking.entity';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let bookingRepository: Repository<Booking>;
  let packageRepository: Repository<ServicePackage>;
  let tenantRepository: Repository<Tenant>;

  const mockTenant: Partial<Tenant> = {
    id: 'tenant-1',
    minimumNoticePeriodHours: 24,
    maxAdvanceBookingDays: 90,
    workingHours: [
      { day: 'monday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'tuesday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'wednesday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'thursday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'friday', startTime: '09:00', endTime: '17:00', isOpen: true },
      { day: 'saturday', startTime: '10:00', endTime: '14:00', isOpen: true },
      { day: 'sunday', startTime: '10:00', endTime: '14:00', isOpen: false },
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
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: getRepositoryToken(Booking), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(ServicePackage), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    bookingRepository = module.get<Repository<Booking>>(getRepositoryToken(Booking));
    packageRepository = module.get<Repository<ServicePackage>>(getRepositoryToken(ServicePackage));
    tenantRepository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAvailability date range filtering', () => {
    it('should count booking on 2026-03-02T10:00:00Z for date 2026-03-02', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(packageRepository, 'findOne').mockResolvedValue(mockPackage as ServicePackage);
      jest.spyOn(bookingRepository, 'find').mockResolvedValue([
        {
          id: 'booking-1',
          tenantId: 'tenant-1',
          packageId: 'package-1',
          eventDate: new Date('2026-03-02T10:00:00Z'),
          startTime: '10:00',
          status: BookingStatus.CONFIRMED,
        },
      ] as Booking[]);

      const result = await service.checkAvailability('tenant-1', 'package-1', '2026-03-02');

      expect(bookingRepository.find).toHaveBeenCalled();
      expect(result.timeSlots).toHaveLength(7);
      const tenOClockSlot = result.timeSlots.find((s) => s.start === '10:00');
      expect(tenOClockSlot?.booked).toBe(1);
    });

    it('should NOT count booking on 2026-03-03T00:30:00Z for date 2026-03-02', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(packageRepository, 'findOne').mockResolvedValue(mockPackage as ServicePackage);
      jest.spyOn(bookingRepository, 'find').mockResolvedValue([
        {
          id: 'booking-2',
          tenantId: 'tenant-1',
          packageId: 'package-1',
          eventDate: new Date('2026-03-03T00:30:00Z'),
          startTime: '00:30',
          status: BookingStatus.CONFIRMED,
        },
      ] as Booking[]);

      const result = await service.checkAvailability('tenant-1', 'package-1', '2026-03-02');

      expect(bookingRepository.find).toHaveBeenCalled();
      expect(result.timeSlots).toHaveLength(7);
      expect(result.timeSlots.every((s) => s.booked === 0)).toBe(true);
    });

    it('should count booking exactly at midnight (2026-03-02T00:00:00Z) for date 2026-03-02', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenant as Tenant);
      jest.spyOn(packageRepository, 'findOne').mockResolvedValue(mockPackage as ServicePackage);
      jest.spyOn(bookingRepository, 'find').mockResolvedValue([
        {
          id: 'booking-3',
          tenantId: 'tenant-1',
          packageId: 'package-1',
          eventDate: new Date('2026-03-02T00:00:00Z'),
          startTime: '09:00',
          status: BookingStatus.CONFIRMED,
        },
      ] as Booking[]);

      const result = await service.checkAvailability('tenant-1', 'package-1', '2026-03-02');

      expect(result.timeSlots).toHaveLength(7);
      const nineOClockSlot = result.timeSlots.find((s) => s.start === '09:00');
      expect(nineOClockSlot?.booked).toBe(1);
    });
  });
});
