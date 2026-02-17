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
import { ReviewsService } from '../../reviews/services/reviews.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
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
  let catalogService: { findPackageById: jest.Mock; findAllPackagesWithFilters: jest.Mock };
  let reviewsService: { getApprovedAggregatesByPackageIds: jest.Mock };
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
    catalogService = { findPackageById: jest.fn(), findAllPackagesWithFilters: jest.fn() };
    reviewsService = { getApprovedAggregatesByPackageIds: jest.fn() };
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
        { provide: ReviewsService, useValue: reviewsService },
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

  describe('listing/package query orchestration', () => {
    const tenant = {
      id: 'tenant-1',
      address: 'Baghdad',
      baseCurrency: 'USD',
    } as Tenant;

    it('maps listings with batch review aggregates and min/max filtering', async () => {
      catalogService.findAllPackagesWithFilters.mockResolvedValue({
        data: [
          {
            id: 'pkg-1',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'Package 1',
            description: 'Desc 1',
            price: 100,
            packageItems: [],
          },
          {
            id: 'pkg-2',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'Package 2',
            description: 'Desc 2',
            price: 250,
            packageItems: [],
          },
        ],
        meta: { totalItems: 2, page: 1, pageSize: 6 },
      });
      reviewsService.getApprovedAggregatesByPackageIds.mockResolvedValue([
        { packageId: 'pkg-2', avgRating: 4.8, reviewCount: 5 },
      ]);

      const result = await service.getListingsForTenant(tenant, {
        tenantSlug: 'test-tenant',
        minPrice: 150,
      });

      expect(catalogService.findAllPackagesWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined, isActive: true, page: 1, limit: 6 }),
      );
      expect(reviewsService.getApprovedAggregatesByPackageIds).toHaveBeenCalledWith(['pkg-2']);
      expect(result.items).toEqual([
        expect.objectContaining({
          id: 'pkg-2',
          title: 'Package 2',
          priceFrom: 250,
          currency: 'USD',
          rating: 4.8,
          reviewCount: 5,
        }),
      ]);
      expect(result.total).toBe(2);
    });

    it('builds featured listings from first six active tenant packages', async () => {
      catalogService.findAllPackagesWithFilters.mockResolvedValue({
        data: [
          {
            id: 'pkg-1',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'A',
            description: null,
            price: 100,
            packageItems: [],
          },
          {
            id: 'pkg-2',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'B',
            description: null,
            price: 110,
            packageItems: [],
          },
          {
            id: 'pkg-3',
            tenantId: 'tenant-2',
            isActive: true,
            name: 'C',
            description: null,
            price: 120,
            packageItems: [],
          },
        ],
        meta: { totalItems: 3, page: 1, pageSize: 6 },
      });
      reviewsService.getApprovedAggregatesByPackageIds.mockResolvedValue([]);

      const result = await service.getFeaturedListingsForTenant(tenant);

      expect(catalogService.findAllPackagesWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true, page: 1, limit: 6 }),
      );
      expect(reviewsService.getApprovedAggregatesByPackageIds).toHaveBeenCalledWith(['pkg-1', 'pkg-2']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'pkg-1', rating: 0, reviewCount: 0 }));
    });

    it('returns package list with tenant and price filters from service', async () => {
      catalogService.findAllPackagesWithFilters.mockResolvedValue({
        data: [
          { id: 'pkg-1', tenantId: 'tenant-1', isActive: true, name: 'A', price: 100 },
          { id: 'pkg-2', tenantId: 'tenant-1', isActive: false, name: 'B', price: 110 },
          { id: 'pkg-3', tenantId: 'tenant-1', isActive: true, name: 'C', price: 300 },
        ],
        meta: { totalItems: 3, page: 2, pageSize: 5 },
      });

      const result = await service.getPackagesForTenant(tenant, 'pkg', 150, undefined, 2, 5);

      expect(catalogService.findAllPackagesWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'pkg', isActive: true, page: 2, limit: 5 }),
      );
      expect(result).toEqual({
        data: [expect.objectContaining({ id: 'pkg-3' })],
        total: 3,
        page: 2,
        limit: 5,
      });
    });
  });
});
