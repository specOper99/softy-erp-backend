import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BookingStatus } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';

describe('BookingsService - Comprehensive Tests', () => {
  let service: BookingsService;

  const mockPackage = {
    id: 'pkg-uuid-123',
    name: 'Wedding Package',
    price: 1500.0,
    isActive: true,
    packageItems: [
      {
        taskTypeId: 'task-type-1',
        quantity: 2,
        taskType: { defaultCommissionAmount: 100 },
      },
      {
        taskTypeId: 'task-type-2',
        quantity: 1,
        taskType: { defaultCommissionAmount: 150 },
      },
    ],
  };

  const mockBooking = {
    id: 'booking-uuid-123',
    clientName: 'John Doe',
    clientPhone: '+1234567890',
    clientEmail: 'john@example.com',
    eventDate: new Date('2024-12-31'),
    status: BookingStatus.DRAFT,
    totalPrice: 1500.0,
    packageId: 'pkg-uuid-123',
    servicePackage: mockPackage,
    tasks: [],
    notes: 'Test notes',
  };

  const mockBookingRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((booking) =>
        Promise.resolve({ id: 'booking-uuid-123', ...booking }),
      ),
    find: jest.fn().mockResolvedValue([mockBooking]),
    findOne: jest.fn(),
    remove: jest.fn().mockResolvedValue(mockBooking),
    softRemove: jest.fn().mockResolvedValue(mockBooking),
  };

  const mockPackageRepository = {
    findOne: jest.fn(),
  };

  const mockFinanceService = {
    createTransactionWithManager: jest
      .fn()
      .mockResolvedValue({ id: 'txn-uuid-123' }),
  };

  const mockMailService = {
    sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((Entity, data) => data),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        {
          provide: getRepositoryToken(ServicePackage),
          useValue: mockPackageRepository,
        },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: MailService, useValue: mockMailService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);

    // Reset all mocks
    jest.clearAllMocks();

    // Default behavior
    mockPackageRepository.findOne.mockImplementation(({ where }) => {
      if (where.id === 'pkg-uuid-123') return Promise.resolve(mockPackage);
      return Promise.resolve(null);
    });

    mockBookingRepository.findOne.mockImplementation(({ where }) => {
      if (where.id === 'booking-uuid-123')
        return Promise.resolve({ ...mockBooking });
      return Promise.resolve(null);
    });
  });

  // ============ CREATE BOOKING TESTS ============
  describe('create', () => {
    it('should create booking with valid package', async () => {
      const dto = {
        clientName: 'John Doe',
        clientPhone: '+1234567890',
        eventDate: '2024-12-31T18:00:00Z',
        packageId: 'pkg-uuid-123',
      };
      const result = await service.create(dto);
      expect(result.status).toBe(BookingStatus.DRAFT);
      expect(result.totalPrice).toBe(1500.0);
    });

    it('should throw NotFoundException for non-existent package', async () => {
      const dto = {
        clientName: 'John Doe',
        eventDate: '2024-12-31T18:00:00Z',
        packageId: 'invalid-pkg',
      };
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should create booking with optional client email', async () => {
      const dto = {
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        eventDate: '2024-12-31T18:00:00Z',
        packageId: 'pkg-uuid-123',
      };
      const result = await service.create(dto);
      expect(result).toBeDefined();
    });

    it('should create booking with notes', async () => {
      const dto = {
        clientName: 'John Doe',
        eventDate: '2024-12-31T18:00:00Z',
        packageId: 'pkg-uuid-123',
        notes: 'Special requirements',
      };
      const result = await service.create(dto);
      expect(result.notes).toBe('Special requirements');
    });

    it('should handle future event dates', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const dto = {
        clientName: 'Future Client',
        eventDate: futureDate.toISOString(),
        packageId: 'pkg-uuid-123',
      };
      const result = await service.create(dto);
      expect(result).toBeDefined();
    });
  });

  // ============ FIND OPERATIONS TESTS ============
  describe('findAll', () => {
    it('should return all bookings', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockBooking]);
    });

    it('should return empty array when no bookings exist', async () => {
      mockBookingRepository.find.mockResolvedValueOnce([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return booking by valid id', async () => {
      const result = await service.findOne('booking-uuid-123');
      expect(result.clientName).toBe('John Doe');
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============ UPDATE BOOKING TESTS ============
  describe('update', () => {
    it('should update draft booking client name', async () => {
      await service.update('booking-uuid-123', {
        clientName: 'Jane Doe',
      });
      expect(mockBookingRepository.save).toHaveBeenCalled();
    });

    it('should update draft booking notes', async () => {
      await service.update('booking-uuid-123', {
        notes: 'Updated notes',
      });
      expect(mockBookingRepository.save).toHaveBeenCalled();
    });

    it('should update draft booking event date', async () => {
      await service.update('booking-uuid-123', {
        eventDate: '2025-01-15T10:00:00Z',
      });
      expect(mockBookingRepository.save).toHaveBeenCalled();
    });

    it('should reject updating non-draft booking without status change', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      await expect(
        service.update('booking-uuid-123', { clientName: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent booking', async () => {
      await expect(
        service.update('invalid-id', { clientName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============ DELETE BOOKING TESTS ============
  describe('remove', () => {
    it('should delete draft booking', async () => {
      await service.remove('booking-uuid-123');
      expect(mockBookingRepository.softRemove).toHaveBeenCalled();
    });

    it('should reject deleting confirmed booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      await expect(service.remove('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject deleting completed booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.COMPLETED,
      });
      await expect(service.remove('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent booking', async () => {
      await expect(service.remove('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============ BOOKING CONFIRMATION WORKFLOW TESTS ============
  describe('confirmBooking', () => {
    it('should confirm draft booking and create tasks', async () => {
      const result = await service.confirmBooking('booking-uuid-123');
      expect(result.booking.status).toBe(BookingStatus.CONFIRMED);
      expect(result.transactionId).toBe('txn-uuid-123');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should create correct number of tasks based on package items', async () => {
      const result = await service.confirmBooking('booking-uuid-123');
      // 2 tasks from first item (quantity 2) + 1 task from second item (quantity 1) = 3
      expect(result.tasksCreated).toBe(3);
    });

    it('should reject confirming already confirmed booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      await expect(service.confirmBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject confirming cancelled booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      });
      await expect(service.confirmBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject confirming completed booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.COMPLETED,
      });
      await expect(service.confirmBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should rollback on transaction failure', async () => {
      mockFinanceService.createTransactionWithManager.mockRejectedValueOnce(
        new Error('Transaction failed'),
      );
      await expect(service.confirmBooking('booking-uuid-123')).rejects.toThrow(
        'Transaction failed',
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent booking', async () => {
      await expect(service.confirmBooking('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============ BOOKING CANCELLATION TESTS ============
  describe('cancelBooking', () => {
    it('should cancel draft booking', async () => {
      const result = await service.cancelBooking('booking-uuid-123');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('should cancel confirmed booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      const result = await service.cancelBooking('booking-uuid-123');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('should reject cancelling already cancelled booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      });
      await expect(service.cancelBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject cancelling completed booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.COMPLETED,
      });
      await expect(service.cancelBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============ BOOKING COMPLETION TESTS ============
  describe('completeBooking', () => {
    it('should complete confirmed booking with all tasks done', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        tasks: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
      });
      const result = await service.completeBooking('booking-uuid-123');
      expect(result.status).toBe(BookingStatus.COMPLETED);
    });

    it('should reject completing draft booking', async () => {
      await expect(service.completeBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject completing booking with pending tasks', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        tasks: [{ status: 'COMPLETED' }, { status: 'PENDING' }],
      });
      await expect(service.completeBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject completing cancelled booking', async () => {
      mockBookingRepository.findOne.mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      });
      await expect(service.completeBooking('booking-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
