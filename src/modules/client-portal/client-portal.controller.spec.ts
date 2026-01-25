import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { ClientPortalController } from './client-portal.controller';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

describe('ClientPortalController', () => {
  let controller: ClientPortalController;
  let clientAuthService: jest.Mocked<ClientAuthService>;
  let clientPortalService: jest.Mocked<ClientPortalService>;

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

    const mockClientPortalService = {
      getMyBookings: jest.fn(),
      getBooking: jest.fn(),
      getClientProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientPortalController],
      providers: [
        { provide: ClientAuthService, useValue: mockClientAuthService },
        { provide: ClientPortalService, useValue: mockClientPortalService },
      ],
    }).compile();

    controller = module.get<ClientPortalController>(ClientPortalController);
    clientAuthService = module.get(ClientAuthService);
    clientPortalService = module.get(ClientPortalService);
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

      const result = await controller.verifyMagicLink({ token: 'magic-token' });

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
      clientPortalService.getMyBookings.mockResolvedValue([mockBooking as Booking]);

      const req = {
        client: mockClient,
      } as unknown as Request;

      const result = await controller.getMyBookings(req);

      expect(clientPortalService.getMyBookings).toHaveBeenCalledWith('client-1', 'tenant-1', expect.any(PaginationDto));
      expect(result).toEqual([mockBooking]);
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

      const result = await controller.getBooking('booking-1', req);

      expect(clientPortalService.getBooking).toHaveBeenCalledWith('booking-1', 'client-1', 'tenant-1');
      expect(result).toEqual(mockBooking);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const req = {
        client: undefined,
      } as unknown as Request;

      await expect(controller.getBooking('booking-1', req)).rejects.toThrow(UnauthorizedException);
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
      });
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const req = {
        client: undefined,
      } as unknown as Request;

      await expect(controller.getProfile(req)).rejects.toThrow(UnauthorizedException);
    });
  });
});
