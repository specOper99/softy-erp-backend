import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { mockTenantContext } from '../../../../test/helpers/mock-factories';
import { ExportService } from '../../../common/services/export.service';
import { AuditService } from '../../audit/application/audit.service';
import { BookingRepository } from '../../bookings/infrastructure/booking.repository';
import type { Client } from '../domain/entities/client.entity';
import { ClientCreatedEvent, ClientDeletedEvent, ClientUpdatedEvent } from '../domain/events/client.events';
import { ClientRepository } from '../infrastructure/client.repository';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  let service: ClientsService;

  const tenantId = 'tenant-123';
  const mockClient = {
    id: 'client-uuid',
    tenantId,
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+1234567890',
    phone2: null,
    notes: null,
    tags: ['vip'],
    notificationPreferences: {},
    createdAt: new Date('2024-01-01'),
  } as unknown as Client;

  const mockClientRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    softRemove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockBookingRepository = {
    count: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockExportService = {
    streamFromStream: jest.fn(),
  };

  const mockEventBus = {
    publish: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContext(tenantId);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: ClientRepository, useValue: mockClientRepository },
        { provide: BookingRepository, useValue: mockBookingRepository },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ExportService, useValue: mockExportService },
        { provide: EventBus, useValue: mockEventBus },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
              cb({
                create: jest.fn((_entity: unknown, dto: unknown) => ({ ...mockClient, ...(dto as object) })),
                save: jest.fn(async (_entity: unknown, value: unknown) => {
                  if (value && typeof value === 'object') return value;
                  return mockClient;
                }),
                softRemove: jest.fn().mockResolvedValue(undefined),
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(ClientsService);
  });

  describe('create', () => {
    it('saves client and publishes ClientCreatedEvent', async () => {
      const dto = { name: 'Jane Doe', email: 'jane@example.com', phone: '+1234567890' };
      mockClientRepository.create.mockReturnValue(mockClient);
      mockClientRepository.save.mockResolvedValue(mockClient);

      const result = await service.create(dto);

      expect(mockEventBus.publish).toHaveBeenCalledWith(expect.any(ClientCreatedEvent));
      expect(result).toEqual(expect.objectContaining({ name: 'Jane Doe', email: 'jane@example.com' }));
    });
  });

  describe('findById', () => {
    it('returns client when found', async () => {
      mockClientRepository.findOne.mockResolvedValue(mockClient);

      await expect(service.findById('client-uuid')).resolves.toEqual(mockClient);
    });

    it('throws NotFoundException when missing', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('publishes ClientUpdatedEvent when fields change', async () => {
      const existing = { ...mockClient };
      const saved = { ...mockClient, name: 'Jane Updated' };
      mockClientRepository.findOne.mockResolvedValue(existing);
      mockClientRepository.save.mockResolvedValue(saved);

      const result = await service.update('client-uuid', { name: 'Jane Updated' });

      expect(mockEventBus.publish).toHaveBeenCalledWith(expect.any(ClientUpdatedEvent));
      expect(mockAuditService.log).toHaveBeenCalled();
      expect(result.name).toBe('Jane Updated');
    });
  });

  describe('delete', () => {
    it('soft-removes client and publishes ClientDeletedEvent', async () => {
      mockClientRepository.findOne.mockResolvedValue(mockClient);
      mockBookingRepository.count.mockResolvedValue(0);
      mockClientRepository.softRemove.mockResolvedValue(mockClient);

      await service.delete('client-uuid');

      expect(mockEventBus.publish).toHaveBeenCalledWith(expect.any(ClientDeletedEvent));
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('rejects delete when client has bookings', async () => {
      mockClientRepository.findOne.mockResolvedValue(mockClient);
      mockBookingRepository.count.mockResolvedValue(2);

      await expect(service.delete('client-uuid')).rejects.toThrow(BadRequestException);
      expect(mockClientRepository.softRemove).not.toHaveBeenCalled();
    });
  });
});
