import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TENANT_REPO_CLIENT } from '../../../common/constants/tenant-repo.tokens';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService', () => {
  let service: ClientPortalService;
  let clientRepository: {
    findOne: jest.Mock;
  };
  let bookingRepository: {
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
    clientRepository = {
      findOne: jest.fn(),
    };

    bookingRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalService,
        { provide: TENANT_REPO_CLIENT, useValue: clientRepository },
        { provide: getRepositoryToken(Booking), useValue: bookingRepository },
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

      const result = await service.getMyBookings('client-1', 'tenant-1');

      expect(bookingRepository.find).toHaveBeenCalledWith({
        where: { clientId: 'client-1', tenantId: 'tenant-1' },
        relations: ['servicePackage'],
        order: { eventDate: 'DESC' },
      });
      expect(result).toEqual([mockBooking]);
    });
  });

  describe('getBooking', () => {
    it('should return booking when found', async () => {
      bookingRepository.findOne.mockResolvedValue(mockBooking);

      const result = await service.getBooking('booking-1', 'client-1', 'tenant-1');

      expect(bookingRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'booking-1', clientId: 'client-1', tenantId: 'tenant-1' },
        relations: ['servicePackage', 'tasks'],
      });
      expect(result).toEqual(mockBooking);
    });

    it('should throw NotFoundException when booking not found', async () => {
      bookingRepository.findOne.mockResolvedValue(null);

      await expect(service.getBooking('booking-1', 'client-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });
});
