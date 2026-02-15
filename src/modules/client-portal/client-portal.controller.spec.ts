import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { ClientsService } from '../bookings/services/clients.service';
import { CatalogService } from '../catalog/services/catalog.service';
import { NotificationService } from '../notifications/services/notification.service';
import { ReviewsService } from '../reviews/services/reviews.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantsService } from '../tenants/tenants.service';
import { ClientPortalController } from './client-portal.controller';
import { AvailabilityService } from './services/availability.service';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

describe('ClientPortalController', () => {
  let controller: ClientPortalController;
  let clientAuthService: jest.Mocked<ClientAuthService>;
  let clientPortalService: jest.Mocked<ClientPortalService>;
  let catalogService: jest.Mocked<CatalogService>;
  let reviewsService: jest.Mocked<ReviewsService>;
  let tenantsService: jest.Mocked<TenantsService>;

  const mockClient: Partial<Client> = {
    id: 'client-1',
    name: 'Test Client',
    email: 'test@example.com',
    phone: '123-456-7890',
    tenantId: 'tenant-1',
  };

  const mockBooking: Partial<Booking> = {
    id: '4ef8dcb8-e2c8-4fc8-b2cc-2d5f17faf001',
    clientId: 'client-1',
    tenantId: 'tenant-1',
    eventDate: new Date(),
    createdAt: new Date(),
    status: 'DRAFT' as Booking['status'],
    packageId: '9f8cfe4d-5571-4634-bf9c-7ce6f7e4d9f1',
    servicePackage: { name: 'Sample Listing' } as Booking['servicePackage'],
  };

  beforeEach(async () => {
    const mockClientAuthService = {
      requestMagicLink: jest.fn(),
      verifyMagicLink: jest.fn(),
      logout: jest.fn(),
      validateClientToken: jest.fn(),
    };

    const mockClientPortalService = {
      getMyBookings: jest.fn(),
      getMyBookingsPaginated: jest.fn(),
      getBooking: jest.fn(),
      getClientProfile: jest.fn(),
      createBooking: jest.fn(),
    };

    const mockCatalogService = {
      findAllPackagesWithFilters: jest.fn(),
      findPackageById: jest.fn(),
    };

    const mockReviewsService = {
      findApprovedByPackage: jest.fn(),
      getApprovedAggregatesByPackageIds: jest.fn(),
      checkDuplicateReview: jest.fn(),
      create: jest.fn(),
    };

    const mockAvailabilityService = {
      checkAvailability: jest.fn(),
      findNextAvailableDate: jest.fn(),
    };

    const mockNotificationService = {
      create: jest.fn(),
      findByClient: jest.fn(),
      markAsReadForClient: jest.fn(),
    };

    const mockClientsService = {
      update: jest.fn(),
    };

    const mockTenantsService = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', slug: 'test-tenant', name: 'Test Tenant', address: 'Baghdad' }),
      findBySlug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientPortalController],
      providers: [
        { provide: ClientAuthService, useValue: mockClientAuthService },
        { provide: ClientPortalService, useValue: mockClientPortalService },
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: ReviewsService, useValue: mockReviewsService },
        { provide: AvailabilityService, useValue: mockAvailabilityService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ClientsService, useValue: mockClientsService },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    }).compile();

    controller = module.get<ClientPortalController>(ClientPortalController);
    clientAuthService = module.get(ClientAuthService);
    clientPortalService = module.get(ClientPortalService);
    catalogService = module.get(CatalogService);
    reviewsService = module.get(ReviewsService);
    tenantsService = module.get(TenantsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should request a magic link for valid email', async () => {
      clientAuthService.requestMagicLink.mockResolvedValue({
        message: 'Magic link sent',
      });

      const result = await controller.requestMagicLink('acme', {
        email: 'test@example.com',
        tenantSlug: 'test-tenant',
      });

      expect(clientAuthService.requestMagicLink).toHaveBeenCalledWith('acme', 'test@example.com');
      expect(result).toEqual({ message: 'Magic link sent' });
    });
  });

  describe('verifyMagicLink', () => {
    it('should verify magic link and return access token', async () => {
      const mockResult = {
        accessToken: 'access-token-123',
        expiresIn: 3600,
        client: mockClient as Client,
      };

      clientAuthService.verifyMagicLink.mockResolvedValue(mockResult);

      const result = await controller.verifyMagicLink({ token: 'magic-token', tenantSlug: 'test-tenant' });

      expect(clientAuthService.verifyMagicLink).toHaveBeenCalledWith('magic-token');
      expect(result.accessToken).toBe('access-token-123');
      expect(result.client.id).toBe('client-1');
      expect(result.client.name).toBe('Test Client');
      expect(result.client.email).toBe('test@example.com');
    });
  });

  describe('logout', () => {
    it('should logout and invalidate token', async () => {
      clientAuthService.logout.mockResolvedValue(undefined);

      const req = {
        headers: { 'x-client-token': 'access-token-123' },
      } as unknown as Request;

      const result = await controller.logout(req);

      expect(clientAuthService.logout).toHaveBeenCalledWith('access-token-123');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('getMyBookings', () => {
    it('should return bookings for authenticated client', async () => {
      clientPortalService.getMyBookingsPaginated.mockResolvedValue({
        items: [mockBooking as Booking],
        total: 1,
        page: 1,
        pageSize: 10,
      });

      const req = {
        client: mockClient,
      } as unknown as Request;

      const result = await controller.getMyBookings(req);

      expect(clientPortalService.getMyBookingsPaginated).toHaveBeenCalledWith('client-1', 'tenant-1', 1, 10);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const req = {
        client: undefined,
      } as unknown as Request;

      await expect(controller.getMyBookings(req)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getBooking', () => {
    it('should return a specific booking for authenticated client', async () => {
      clientPortalService.getBooking.mockResolvedValue(mockBooking as Booking);

      const req = {
        client: mockClient,
      } as unknown as Request;

      const result = await controller.getBooking('4ef8dcb8-e2c8-4fc8-b2cc-2d5f17faf001', req);

      expect(clientPortalService.getBooking).toHaveBeenCalledWith(
        '4ef8dcb8-e2c8-4fc8-b2cc-2d5f17faf001',
        'client-1',
        'tenant-1',
      );
      expect(result.id).toBe('4ef8dcb8-e2c8-4fc8-b2cc-2d5f17faf001');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const req = {
        client: undefined,
      } as unknown as Request;

      await expect(controller.getBooking('4ef8dcb8-e2c8-4fc8-b2cc-2d5f17faf001', req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return client profile for authenticated client', async () => {
      clientPortalService.getClientProfile.mockResolvedValue({
        id: 'client-1',
        name: 'Test Client',
        email: 'test@example.com',
        phone: '123-456-7890',
      });

      const req = {
        client: mockClient,
      } as unknown as Request;

      const result = await controller.getProfile(req);

      expect(clientPortalService.getClientProfile).toHaveBeenCalledWith('client-1', 'tenant-1');
      expect(result).toEqual({
        id: 'client-1',
        name: 'Test Client',
        email: 'test@example.com',
        phone: '123-456-7890',
        tenantSlug: 'test-tenant',
        company: 'Test Tenant',
        location: 'Baghdad',
        joinedAt: undefined,
      });
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const req = {
        client: undefined,
      } as unknown as Request;

      await expect(controller.getProfile(req)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getListings', () => {
    it('uses one batch aggregate call and avoids per-package review calls', async () => {
      tenantsService.findBySlug.mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        address: 'Baghdad',
        baseCurrency: 'USD',
      } as unknown as Tenant);
      catalogService.findAllPackagesWithFilters.mockResolvedValue({
        data: [
          {
            id: 'pkg-1',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'Package 1',
            price: 100,
            description: 'Desc 1',
            packageItems: [],
          },
          {
            id: 'pkg-2',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'Package 2',
            price: 200,
            description: 'Desc 2',
            packageItems: [],
          },
        ],
        meta: {
          totalItems: 2,
          page: 1,
          pageSize: 6,
        },
      } as any);
      reviewsService.getApprovedAggregatesByPackageIds.mockResolvedValue([
        { packageId: 'pkg-1', avgRating: 4.5, reviewCount: 2 },
      ]);

      const result = await controller.getListings({ tenantSlug: 'test-tenant' });

      expect(reviewsService.getApprovedAggregatesByPackageIds).toHaveBeenCalledTimes(1);
      expect(reviewsService.getApprovedAggregatesByPackageIds).toHaveBeenCalledWith('tenant-1', ['pkg-1', 'pkg-2']);
      expect(reviewsService.findApprovedByPackage).not.toHaveBeenCalled();
      expect(result.items[0]?.rating).toBe(4.5);
      expect(result.items[0]?.reviewCount).toBe(2);
      expect(result.items[1]?.rating).toBe(0);
      expect(result.items[1]?.reviewCount).toBe(0);
    });
  });

  describe('getFeaturedListings', () => {
    it('uses one batch aggregate call and avoids per-package review calls', async () => {
      tenantsService.findBySlug.mockResolvedValue({
        id: 'tenant-1',
        slug: 'test-tenant',
        name: 'Test Tenant',
        address: 'Baghdad',
        baseCurrency: 'USD',
      } as unknown as Tenant);
      catalogService.findAllPackagesWithFilters.mockResolvedValue({
        data: [
          {
            id: 'pkg-1',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'Package 1',
            price: 100,
            description: 'Desc 1',
            packageItems: [],
          },
          {
            id: 'pkg-2',
            tenantId: 'tenant-1',
            isActive: true,
            name: 'Package 2',
            price: 200,
            description: 'Desc 2',
            packageItems: [],
          },
        ],
        meta: {
          totalItems: 2,
          page: 1,
          pageSize: 6,
        },
      } as any);
      reviewsService.getApprovedAggregatesByPackageIds.mockResolvedValue([
        { packageId: 'pkg-2', avgRating: 5, reviewCount: 1 },
      ]);

      const result = await controller.getFeaturedListings('test-tenant');

      expect(reviewsService.getApprovedAggregatesByPackageIds).toHaveBeenCalledTimes(1);
      expect(reviewsService.getApprovedAggregatesByPackageIds).toHaveBeenCalledWith('tenant-1', ['pkg-1', 'pkg-2']);
      expect(reviewsService.findApprovedByPackage).not.toHaveBeenCalled();
      expect(result[0]?.rating).toBe(0);
      expect(result[0]?.reviewCount).toBe(0);
      expect(result[1]?.rating).toBe(5);
      expect(result[1]?.reviewCount).toBe(1);
    });
  });
});
