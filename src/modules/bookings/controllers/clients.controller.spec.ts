import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from '../services/bookings.service';
import { BookingExportService } from '../services/booking-export.service';
import { ClientsController } from './clients.controller';

describe('ClientsController', () => {
  let controller: ClientsController;
  let service: BookingsService;
  let exportService: BookingExportService;

  const mockClient = {
    id: 'client-uuid',
    name: 'Test Client',
    email: 'client@example.com',
    phone: '+1234567890',
    notes: 'Test notes',
  };

  const mockPaginatedResponse = {
    data: [mockClient],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        {
          provide: BookingsService,
          useValue: {
            createClient: jest.fn().mockResolvedValue(mockClient),
            findAllClients: jest.fn().mockResolvedValue(mockPaginatedResponse),
            findClientById: jest.fn().mockResolvedValue(mockClient),
            updateClient: jest.fn().mockResolvedValue(mockClient),
            deleteClient: jest.fn().mockResolvedValue(undefined),
            updateClientTags: jest.fn().mockResolvedValue(mockClient),
          },
        },
        {
          provide: BookingExportService,
          useValue: {
            exportClientsToCSV: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
    service = module.get<BookingsService>(BookingsService);
    exportService = module.get<BookingExportService>(BookingExportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call bookingsService.createClient with dto', async () => {
      const dto = {
        name: 'New Client',
        email: 'new@example.com',
        phone: '+1234567890',
      };

      const result = await controller.create(dto);

      expect(service.createClient).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockClient);
    });
  });

  describe('findAll', () => {
    it('should call bookingsService.findAllClients with pagination', async () => {
      const query = { page: 1, limit: 10 } as any;

      const result = await controller.findAll(query, undefined);

      expect(service.findAllClients).toHaveBeenCalledWith(query, undefined);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should work with empty query', async () => {
      const emptyQuery = {} as any;
      await controller.findAll(emptyQuery, undefined);

      expect(service.findAllClients).toHaveBeenCalledWith(
        emptyQuery,
        undefined,
      );
    });
  });

  describe('findOne', () => {
    it('should call bookingsService.findClientById with id', async () => {
      const result = await controller.findOne('client-uuid');

      expect(service.findClientById).toHaveBeenCalledWith('client-uuid');
      expect(result).toEqual(mockClient);
    });
  });

  describe('update', () => {
    it('should call bookingsService.updateClient with dto', async () => {
      const dto = {
        name: 'Updated Client',
        email: 'updated@example.com',
        phone: '+9876543210',
        notes: 'Updated notes',
      };

      const result = await controller.update('client-uuid', dto);

      expect(service.updateClient).toHaveBeenCalledWith('client-uuid', dto);
      expect(result).toEqual(mockClient);
    });
  });

  describe('delete', () => {
    it('should call bookingsService.deleteClient with id', async () => {
      await controller.remove('client-uuid');

      expect(service.deleteClient).toHaveBeenCalledWith('client-uuid');
    });
  });

  describe('updateTags', () => {
    it('should call bookingsService.updateClientTags with id and tags', async () => {
      const tags = ['vip', 'returning'];
      const result = await controller.updateTags('client-uuid', { tags });

      expect(service.updateClientTags).toHaveBeenCalledWith(
        'client-uuid',
        tags,
      );
      expect(result).toEqual(mockClient);
    });
  });

  describe('exportClients', () => {
    it('should call bookingExportService.exportClientsToCSV', async () => {
      const mockResponse = {
        setHeader: jest.fn(),
        end: jest.fn(),
      };

      await controller.exportClients(mockResponse as any);

      expect(exportService.exportClientsToCSV).toHaveBeenCalled();
    });
  });
});
