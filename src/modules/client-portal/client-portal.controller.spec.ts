import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { ClientPortalController } from './client-portal.controller';
import { ClientAuthService } from './services/client-auth.service';

describe('ClientPortalController', () => {
  let controller: ClientPortalController;
  let clientAuthService: jest.Mocked<ClientAuthService>;
  let bookingRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let clientRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
  };

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
    const mockClientAuthService = {
      requestMagicLink: jest.fn(),
      verifyMagicLink: jest.fn(),
      logout: jest.fn(),
      validateClientToken: jest.fn(),
    };

    bookingRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    clientRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientPortalController],
      providers: [
        { provide: ClientAuthService, useValue: mockClientAuthService },
        { provide: getRepositoryToken(Booking), useValue: bookingRepository },
        { provide: getRepositoryToken(Client), useValue: clientRepository },
      ],
    }).compile();

    controller = module.get<ClientPortalController>(ClientPortalController);
    clientAuthService = module.get(ClientAuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should request a magic link for valid email', async () => {
      clientAuthService.requestMagicLink.mockResolvedValue({
        message: 'Magic link sent',
      });

      const result = await controller.requestMagicLink({
        email: 'test@example.com',
      });

      expect(clientAuthService.requestMagicLink).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result).toEqual({ message: 'Magic link sent' });
    });
  });

  describe('verifyMagicLink', () => {
    it('should verify magic link and return access token', async () => {
      const mockResult = {
        accessToken: 'access-token-123',
        expiresAt: new Date(),
        client: mockClient as Client,
      };

      clientAuthService.verifyMagicLink.mockResolvedValue(mockResult);

      const result = await controller.verifyMagicLink({ token: 'magic-token' });

      expect(clientAuthService.verifyMagicLink).toHaveBeenCalledWith(
        'magic-token',
      );
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
      } as any;

      const result = await controller.logout(req);

      expect(clientAuthService.logout).toHaveBeenCalledWith('access-token-123');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('getMyBookings', () => {
    it('should return bookings for authenticated client', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(
        mockClient as Client,
      );
      bookingRepository.find.mockResolvedValue([mockBooking]);

      const req = {
        headers: { 'x-client-token': 'access-token-123' },
      } as any;

      const result = await controller.getMyBookings(req);

      expect(clientAuthService.validateClientToken).toHaveBeenCalledWith(
        'access-token-123',
      );
      expect(bookingRepository.find).toHaveBeenCalledWith({
        where: { clientId: 'client-1', tenantId: 'tenant-1' },
        relations: ['servicePackage'],
        order: { eventDate: 'DESC' },
      });
      expect(result).toEqual([mockBooking]);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(null);

      const req = {
        headers: { 'x-client-token': 'invalid-token' },
      } as any;

      await expect(controller.getMyBookings(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getBooking', () => {
    it('should return a specific booking for authenticated client', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(
        mockClient as Client,
      );
      bookingRepository.findOne.mockResolvedValue(mockBooking);

      const req = {
        headers: { 'x-client-token': 'access-token-123' },
      } as any;

      const result = await controller.getBooking('booking-1', req);

      expect(bookingRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'booking-1', clientId: 'client-1', tenantId: 'tenant-1' },
        relations: ['servicePackage', 'tasks'],
      });
      expect(result).toEqual(mockBooking);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(null);

      const req = {
        headers: { 'x-client-token': 'invalid-token' },
      } as any;

      await expect(controller.getBooking('booking-1', req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when booking not found', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(
        mockClient as Client,
      );
      bookingRepository.findOne.mockResolvedValue(null);

      const req = {
        headers: { 'x-client-token': 'access-token-123' },
      } as any;

      await expect(controller.getBooking('nonexistent', req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return client profile for authenticated client', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(
        mockClient as Client,
      );

      const req = {
        headers: { 'x-client-token': 'access-token-123' },
      } as any;

      const result = await controller.getProfile(req);

      expect(result).toEqual({
        id: 'client-1',
        name: 'Test Client',
        email: 'test@example.com',
        phone: '123-456-7890',
      });
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      clientAuthService.validateClientToken.mockResolvedValue(null);

      const req = {
        headers: { 'x-client-token': 'invalid-token' },
      } as any;

      await expect(controller.getProfile(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
