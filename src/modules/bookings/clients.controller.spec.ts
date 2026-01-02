import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { ClientsController } from './clients.controller';

describe('ClientsController', () => {
  let controller: ClientsController;
  let service: BookingsService;

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
          },
        },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
    service = module.get<BookingsService>(BookingsService);
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

      const result = await controller.findAll(query);

      expect(service.findAllClients).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should work with empty query', async () => {
      const emptyQuery = {} as any;
      await controller.findAll(emptyQuery);

      expect(service.findAllClients).toHaveBeenCalledWith(emptyQuery);
    });
  });

  describe('findOne', () => {
    it('should call bookingsService.findClientById with id', async () => {
      const result = await controller.findOne('client-uuid');

      expect(service.findClientById).toHaveBeenCalledWith('client-uuid');
      expect(result).toEqual(mockClient);
    });
  });
});
