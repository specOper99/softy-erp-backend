import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ClientsService } from '../services/clients.service';
import { ClientsController } from './clients.controller';

describe('ClientsController', () => {
  let controller: ClientsController;
  let service: ClientsService;

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
          provide: ClientsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockClient),
            findAll: jest.fn().mockResolvedValue(mockPaginatedResponse),
            findById: jest.fn().mockResolvedValue(mockClient),
            update: jest.fn().mockResolvedValue(mockClient),
            delete: jest.fn().mockResolvedValue(undefined),
            updateTags: jest.fn().mockResolvedValue(mockClient),
            exportToCSV: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with dto', async () => {
      const dto = {
        name: 'New Client',
        email: 'new@example.com',
        phone: '+1234567890',
      };

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockClient);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with pagination', async () => {
      const query = { page: 1, limit: 10 } as PaginationDto;

      const result = await controller.findAll(query, undefined);

      expect(service.findAll).toHaveBeenCalledWith(query, undefined);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should work with empty query', async () => {
      const emptyQuery = {} as PaginationDto;
      await controller.findAll(emptyQuery, undefined);

      expect(service.findAll).toHaveBeenCalledWith(emptyQuery, undefined);
    });
  });

  describe('findOne', () => {
    it('should call service.findById with id', async () => {
      const result = await controller.findOne('client-uuid');

      expect(service.findById).toHaveBeenCalledWith('client-uuid');
      expect(result).toEqual(mockClient);
    });
  });

  describe('update', () => {
    it('should call service.update with dto', async () => {
      const dto = {
        name: 'Updated Client',
        email: 'updated@example.com',
        phone: '+9876543210',
        notes: 'Updated notes',
      };

      const result = await controller.update('client-uuid', dto);

      expect(service.update).toHaveBeenCalledWith('client-uuid', dto);
      expect(result).toEqual(mockClient);
    });
  });

  describe('delete', () => {
    it('should call service.delete with id', async () => {
      await controller.remove('client-uuid');

      expect(service.delete).toHaveBeenCalledWith('client-uuid');
    });
  });

  describe('updateTags', () => {
    it('should call service.updateTags with id and tags', async () => {
      const tags = ['vip', 'returning'];
      const result = await controller.updateTags('client-uuid', { tags });

      expect(service.updateTags).toHaveBeenCalledWith('client-uuid', tags);
      expect(result).toEqual(mockClient);
    });
  });

  describe('exportClients', () => {
    it('should call service.exportToCSV', async () => {
      const mockResponse = {
        setHeader: jest.fn(),
        end: jest.fn(),
      };

      await controller.exportClients(mockResponse as unknown as Response);

      expect(service.exportToCSV).toHaveBeenCalled();
    });
  });
});
