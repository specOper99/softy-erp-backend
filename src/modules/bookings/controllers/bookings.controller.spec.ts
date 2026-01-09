import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingWorkflowService } from '../services/booking-workflow.service';
import { BookingsService } from '../services/bookings.service';
import { BookingExportService } from '../services/booking-export.service';
import { BookingsController } from './bookings.controller';

describe('BookingsController', () => {
  let controller: BookingsController;
  let service: BookingsService;
  let workflowService: BookingWorkflowService;

  const mockBooking = { id: 'uuid', status: BookingStatus.DRAFT };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        {
          provide: BookingsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockBooking),
            findAll: jest.fn().mockResolvedValue([mockBooking]),
            findAllCursor: jest
              .fn()
              .mockResolvedValue({ data: [mockBooking], nextCursor: null }),
            findOne: jest.fn().mockResolvedValue(mockBooking),
            update: jest.fn().mockResolvedValue(mockBooking),
            remove: jest.fn().mockResolvedValue(undefined),
            confirmBooking: jest.fn().mockResolvedValue(mockBooking),
            cancelBooking: jest.fn().mockResolvedValue(mockBooking),
            completeBooking: jest.fn().mockResolvedValue(mockBooking),
            recordPayment: jest.fn().mockResolvedValue(mockBooking),
            duplicateBooking: jest.fn().mockResolvedValue(mockBooking),
            exportBookingsToCSV: jest.fn().mockResolvedValue('csv'),
            findAllClients: jest.fn().mockResolvedValue({ data: [], total: 0 }),
            findClientById: jest.fn().mockResolvedValue({}),
            createClient: jest.fn().mockResolvedValue({}),
            updateClient: jest.fn().mockResolvedValue({}),
            deleteClient: jest.fn().mockResolvedValue(undefined),
            updateClientTags: jest.fn().mockResolvedValue({}),
            exportClientsToCSV: jest.fn().mockResolvedValue('csv'),
          },
        },
        {
          provide: BookingWorkflowService,
          useValue: {
            confirmBooking: jest.fn().mockResolvedValue(mockBooking),
          },
        },
        {
          provide: BookingExportService,
          useValue: {
            exportBookingsToCSV: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<BookingsController>(BookingsController);
    service = module.get<BookingsService>(BookingsService);
    workflowService = module.get<BookingWorkflowService>(
      BookingWorkflowService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { clientId: 'c-id' } as any;
      await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      await controller.findAll({} as any);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      await controller.findOne('uuid');
      expect(service.findOne).toHaveBeenCalledWith('uuid');
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { status: BookingStatus.CONFIRMED } as any;
      await controller.update('uuid', dto);
      expect(service.update).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('remove', () => {
    it('should call service.remove', async () => {
      await controller.remove('uuid');
      expect(service.remove).toHaveBeenCalledWith('uuid');
    });
  });

  describe('confirm', () => {
    it('should call workflowService.confirmBooking', async () => {
      await controller.confirm('uuid');
      expect(workflowService.confirmBooking).toHaveBeenCalledWith('uuid');
    });
  });

  describe('cancel', () => {
    it('should call service.cancelBooking', async () => {
      await controller.cancel('uuid', {} as any);
      expect(service.cancelBooking).toHaveBeenCalledWith('uuid', {});
    });
  });

  describe('complete', () => {
    it('should call service.completeBooking', async () => {
      await controller.complete('uuid');
      expect(service.completeBooking).toHaveBeenCalledWith('uuid');
    });
  });
});
