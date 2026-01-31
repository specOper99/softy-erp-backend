import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { BookingFilterDto, CancelBookingDto, CreateBookingDto, UpdateBookingDto } from '../dto';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingExportService } from '../services/booking-export.service';
import { BookingWorkflowService } from '../services/booking-workflow.service';
import { BookingsService } from '../services/bookings.service';
import { BookingsController } from './bookings.controller';

describe('BookingsController', () => {
  let controller: BookingsController;
  let service: BookingsService;
  let workflowService: BookingWorkflowService;
  let exportService: BookingExportService;

  const mockBooking = { id: 'uuid', status: BookingStatus.DRAFT };
  const mockUser = { id: 'user-id', role: Role.ADMIN } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        {
          provide: BookingsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockBooking),
            findAll: jest.fn().mockResolvedValue([mockBooking]),
            findAllCursor: jest.fn().mockResolvedValue({ data: [mockBooking], nextCursor: null }),
            findOne: jest.fn().mockResolvedValue(mockBooking),
            update: jest.fn().mockResolvedValue(mockBooking),
            remove: jest.fn().mockResolvedValue(undefined),
            recordPayment: jest.fn().mockResolvedValue(mockBooking),
          },
        },
        {
          provide: BookingWorkflowService,
          useValue: {
            confirmBooking: jest.fn().mockResolvedValue(mockBooking),
            cancelBooking: jest.fn().mockResolvedValue(mockBooking),
            completeBooking: jest.fn().mockResolvedValue(mockBooking),
            duplicateBooking: jest.fn().mockResolvedValue(mockBooking),
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
    workflowService = module.get<BookingWorkflowService>(BookingWorkflowService);
    exportService = module.get<BookingExportService>(BookingExportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { clientId: 'c-id' } as unknown as CreateBookingDto;
      await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      await controller.findAll({} as BookingFilterDto, mockUser);
      expect(service.findAll).toHaveBeenCalledWith({}, mockUser);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      await controller.findOne('uuid', mockUser);
      expect(service.findOne).toHaveBeenCalledWith('uuid', mockUser);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { status: BookingStatus.CONFIRMED } as UpdateBookingDto;
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
    it('should call workflowService.cancelBooking', async () => {
      await controller.cancel('uuid', {} as CancelBookingDto);
      expect(workflowService.cancelBooking).toHaveBeenCalledWith('uuid', {});
    });
  });

  describe('complete', () => {
    it('should call workflowService.completeBooking', async () => {
      await controller.complete('uuid');
      expect(workflowService.completeBooking).toHaveBeenCalledWith('uuid');
    });
  });

  describe('duplicate', () => {
    it('should call workflowService.duplicateBooking', async () => {
      await controller.duplicate('uuid');
      expect(workflowService.duplicateBooking).toHaveBeenCalledWith('uuid');
    });
  });

  describe('exportBookings', () => {
    it('should call exportService.exportBookingsToCSV', async () => {
      const res = {} as unknown as Response;
      await controller.exportBookings(res);
      expect(exportService.exportBookingsToCSV).toHaveBeenCalledWith(res);
    });
  });
});
