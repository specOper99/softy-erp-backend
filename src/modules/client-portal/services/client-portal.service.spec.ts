import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TENANT_REPO_CLIENT } from '../../../common/constants/tenant-repo.tokens';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { BookingsService } from '../../bookings/services/bookings.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { TenantsService } from '../../tenants/tenants.service';
import { AvailabilityService } from './availability.service';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService', () => {
  let service: ClientPortalService;
  let clientRepository: {
    findOne: jest.Mock;
  };
  let bookingRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
  };
  let bookingsService: { create: jest.Mock };
  let catalogService: { findPackageById: jest.Mock };
  let tenantsService: { findOne: jest.Mock };
  let availabilityService: { invalidateAvailabilityCache: jest.Mock };
  let notificationService: { create: jest.Mock };

  const mockClient: Partial<Client> = {
    id: 'client-1',
    name: 'Test Client',
    email: 'test@example.com',
    phone: '123-456-7890',
    tenantId: 'tenant-1',
  };

  const mockBooking: Partial<Booking> = {
    id: 'booking-1',
    clientId: 'client-1',
    tenantId: 'tenant-1',
    eventDate: new Date(),
  };

  beforeEach(async () => {
    clientRepository = {
      findOne: jest.fn(),
    };

    bookingRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      count: jest.fn(),
    };

    bookingsService = { create: jest.fn() };
    catalogService = { findPackageById: jest.fn() };
    tenantsService = { findOne: jest.fn() };
    availabilityService = { invalidateAvailabilityCache: jest.fn() };
    notificationService = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalService,
        { provide: TENANT_REPO_CLIENT, useValue: clientRepository },
        { provide: BookingRepository, useValue: bookingRepository },
        { provide: BookingsService, useValue: bookingsService },
        { provide: CatalogService, useValue: catalogService },
        { provide: TenantsService, useValue: tenantsService },
        { provide: AvailabilityService, useValue: availabilityService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<ClientPortalService>(ClientPortalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClientProfile', () => {
    it('should return client profile when found and tenant matches', async () => {
      clientRepository.findOne.mockResolvedValue(mockClient);

      const result = await service.getClientProfile('client-1', 'tenant-1');

      expect(clientRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'client-1' },
      });
      expect(result).toEqual({
        id: 'client-1',
        name: 'Test Client',
        email: 'test@example.com',
        phone: '123-456-7890',
      });
    });

    it('should throw NotFoundException when client not found', async () => {
      clientRepository.findOne.mockResolvedValue(null);

      await expect(service.getClientProfile('client-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tenantId mismatch', async () => {
      clientRepository.findOne.mockResolvedValue({
        ...mockClient,
        tenantId: 'other-tenant',
      });

      await expect(service.getClientProfile('client-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyBookings', () => {
    it('should return bookings for the client', async () => {
      bookingRepository.find.mockResolvedValue([mockBooking]);

      const query = new PaginationDto();

      const result = await service.getMyBookings('client-1', 'tenant-1', query);

      expect(bookingRepository.find).toHaveBeenCalledWith({
        where: { clientId: 'client-1' },
        relations: ['servicePackage'],
        order: { eventDate: 'DESC' },
        skip: query.getSkip(),
        take: query.getTake(),
      });
      expect(result).toEqual([mockBooking]);
    });

    it('should clamp bookings list limit to <= 100', async () => {
      bookingRepository.find.mockResolvedValue([mockBooking]);

      const query = new PaginationDto();
      query.limit = 1000;

      await service.getMyBookings('client-1', 'tenant-1', query);

      expect(bookingRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });

  describe('getBooking', () => {
    it('should return booking when found', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      };
      bookingRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getBooking('booking-1', 'client-1', 'tenant-1');

      expect(bookingRepository.createQueryBuilder).toHaveBeenCalledWith('booking');
      expect(result).toEqual(mockBooking);
    });

    it('should throw NotFoundException when booking not found', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      bookingRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getBooking('booking-1', 'client-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createBooking', () => {
    it('should create booking using shared booking service flow', async () => {
      const tenant = {
        id: 'tenant-1',
        defaultTaxRate: 10,
        minimumNoticePeriodHours: 1,
        maxConcurrentBookingsPerSlot: 2,
        notificationEmails: [],
      };

      tenantsService.findOne.mockResolvedValue(tenant);
      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-1',
        tenantId: 'tenant-1',
      });
      bookingRepository.count.mockResolvedValue(0);

      const createdBooking = {
        id: 'booking-1',
        status: BookingStatus.DRAFT,
      } as Booking;
      bookingsService.create.mockResolvedValue(createdBooking);

      const result = await service.createBooking(mockClient as Client, {
        packageId: 'pkg-1',
        eventDate: '2099-01-01',
        startTime: '10:00',
        notes: 'notes',
      });

      expect(bookingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          packageId: 'pkg-1',
          startTime: '10:00',
        }),
      );
      expect(availabilityService.invalidateAvailabilityCache).toHaveBeenCalledWith('tenant-1', 'pkg-1', '2099-01-01');
      expect(result).toEqual(createdBooking);
    });
  });
});
