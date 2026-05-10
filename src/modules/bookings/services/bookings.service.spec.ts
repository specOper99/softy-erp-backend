import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  createMockAuditService,
  createMockBooking,
  createMockCatalogService,
  createMockDataSource,
  createMockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { FlagsService } from '../../../common/flags/flags.service';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import type { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import type { CreateBookingDto } from '../dto';
import { ProcessingType } from '../entities/processing-type.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingRepository } from '../repositories/booking.repository';
import { ProcessingTypeRepository } from '../repositories/processing-type.repository';
import { BookingsPaymentsService } from './bookings-payments.service';
import { BookingsPricingService } from './bookings-pricing.service';
import { BookingsService } from './bookings.service';
import { StaffConflictService } from './staff-conflict.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRepository: ReturnType<typeof createMockRepository>;
  let catalogService: ReturnType<typeof createMockCatalogService>;
  let auditService: ReturnType<typeof createMockAuditService>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let outboxRepository: { save: jest.Mock };
  let staffConflictService: { checkPackageStaffAvailability: jest.Mock };
  let flagsService: { isEnabled: jest.Mock };
  let processingTypeRepository: ReturnType<typeof createMockRepository>;

  const mockBooking = createMockBooking({
    id: 'booking-123',
    tenantId: 'tenant-1',
    status: BookingStatus.DRAFT,
    eventDate: new Date(Date.now() + 86400000), // tomorrow
    clientId: 'client-1',
    packageId: 'pkg-1',
  });

  const mockAdminUser = { id: 'admin-1', role: Role.ADMIN } as User;

  const expectFieldStaffRbacWithBackwardCompatibility = (queryBuilder: { andWhere: jest.Mock }): void => {
    const rbacCall = queryBuilder.andWhere.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('task_assignees'),
    );
    expect(rbacCall).toBeDefined();
    expect(rbacCall[0]).toContain('assigned_user_id');
    expect(rbacCall[1]).toEqual({ userId: 'user-1' });
  };

  beforeEach(async () => {
    mockTenantContext('tenant-123');

    bookingRepository = createMockRepository();
    catalogService = createMockCatalogService();
    auditService = createMockAuditService();
    dataSource = createMockDataSource();
    outboxRepository = { save: jest.fn().mockResolvedValue({}) };
    staffConflictService = {
      checkPackageStaffAvailability: jest.fn().mockResolvedValue({
        ok: true,
        requiredStaffCount: 1,
        eligibleCount: 1,
        busyCount: 0,
        availableCount: 1,
      }),
    };
    flagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    processingTypeRepository = createMockRepository<ProcessingType>();
    processingTypeRepository.find.mockResolvedValue([]);

    // Override dataSource transaction to return mock booking
    dataSource.transaction.mockImplementation((cb) =>
      cb({
        save: jest.fn().mockResolvedValue(mockBooking),
        update: jest.fn(),
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        BookingsPricingService,
        {
          provide: BookingsPaymentsService,
          useValue: {
            recordPayment: jest.fn(),
            recordRefund: jest.fn(),
            markAsPaid: jest.fn(),
            getBookingTransactions: jest.fn(),
          },
        },
        {
          provide: BookingRepository,
          useValue: bookingRepository,
        },
        {
          provide: CatalogService,
          useValue: catalogService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: outboxRepository,
        },
        {
          provide: AvailabilityCacheOwnerService,
          useValue: {
            delAvailability: jest.fn(),
            getAvailability: jest.fn(),
            setAvailability: jest.fn(),
          },
        },
        {
          provide: StaffConflictService,
          useValue: staffConflictService,
        },
        {
          provide: FlagsService,
          useValue: flagsService,
        },
        {
          provide: MetricsFactory,
          useValue: {
            getOrCreateCounter: jest.fn().mockReturnValue({ inc: jest.fn() }),
          },
        },
        {
          provide: ProcessingTypeRepository,
          useValue: processingTypeRepository,
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('create', () => {
    it('should create a booking', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Test booking',
      };

      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-1',
        price: 100,
        name: 'Test Package',
        durationMinutes: 90,
      });

      bookingRepository.create.mockReturnValue(mockBooking);
      bookingRepository.save.mockResolvedValue(mockBooking);

      const result = await service.create(dto);

      expect(result).toEqual(mockBooking);
      expect(bookingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: dto.clientId,
          status: BookingStatus.DRAFT,
          amountPaid: 0,
          refundAmount: 0,
          durationMinutes: 90,
          paymentStatus: PaymentStatus.UNPAID,
          // tenantId should NOT be manually passed here, but repository handles it.
          // The service passes an object WITHOUT tenantId to repository.create.
          // The repository.create method will add tenantId.
          // Wait, the test mock for create just returns the mock object.
          // The EXPECTATION should verify what 'create' was called WITH.
        }),
      );
      // Verify tenantId was NOT passed to create manually (service logic check)
      const createCallArg = bookingRepository.create.mock.calls[0][0];
      expect(createCallArg.tenantId).toBeUndefined();

      expect(outboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BookingCreatedEvent', aggregateId: mockBooking.id }),
      );
    });

    it('should snapshot durationMinutes from selected package', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        startTime: '10:00',
      };

      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-1',
        price: 100,
        name: 'Test Package',
        durationMinutes: 120,
      });
      bookingRepository.create.mockReturnValue(mockBooking);
      bookingRepository.save.mockResolvedValue(mockBooking);

      await service.create(dto);

      expect(bookingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 120,
        }),
      );
    });

    it('should round tax amount to 2 decimal places', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        taxRate: 10.125,
      };

      catalogService.findPackageById.mockResolvedValue({ price: 100, durationMinutes: 60 });
      bookingRepository.create.mockReturnValue(mockBooking);
      bookingRepository.save.mockResolvedValue(mockBooking);

      await service.create(dto);

      expect(bookingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taxAmount: 10.13,
          totalPrice: 110.13,
        }),
      );
    });

    it('should throw if event date is in the past', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() - 86400000).toISOString(), // yesterday
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should attach processing types when processingTypeIds provided', async () => {
      const mockProcessingType = { id: 'pt-1', tenantId: 'tenant-123', name: 'Raw Edit' };
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        processingTypeIds: ['pt-1'],
      };

      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-1',
        price: 100,
        name: 'Test Package',
        durationMinutes: 60,
      });
      bookingRepository.create.mockReturnValue({ ...mockBooking, processingTypes: [] });
      bookingRepository.save.mockResolvedValue({ ...mockBooking, processingTypes: [mockProcessingType] });
      processingTypeRepository.find.mockResolvedValue([mockProcessingType]);

      await service.create(dto);

      expect(processingTypeRepository.find).toHaveBeenCalled();
      // save is called twice: once for main booking, once to persist relations
      expect(bookingRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should persist handover type when provided', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        handoverType: PaymentMethod.CASH,
      };

      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-1',
        price: 100,
        name: 'Test Package',
        durationMinutes: 60,
      });
      bookingRepository.create.mockReturnValue(mockBooking);
      bookingRepository.save.mockResolvedValue(mockBooking);

      await service.create(dto);

      expect(bookingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          handoverType: PaymentMethod.CASH,
        }),
      );
    });

    it('should reject create when staff conflict exists', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        startTime: '10:00',
      };

      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-1',
        price: 100,
        name: 'Test Package',
        durationMinutes: 90,
      });

      staffConflictService.checkPackageStaffAvailability.mockResolvedValue({
        ok: false,
        requiredStaffCount: 2,
        eligibleCount: 2,
        busyCount: 1,
        availableCount: 1,
      });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(bookingRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      });
    });

    it('publishes BookingUpdatedEvent and BookingPriceChangedEvent once when pricing changes', async () => {
      const lockedBooking = {
        ...mockBooking,
        subTotal: 100,
        taxAmount: 10,
        totalPrice: 110,
      };
      const savedBooking = {
        ...mockBooking,
        subTotal: 200,
        taxAmount: 20,
        totalPrice: 220,
      };

      dataSource.transaction.mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(lockedBooking),
          save: jest.fn().mockResolvedValue(savedBooking),
        }),
      );

      await service.update('booking-123', { notes: 'updated notes' }, mockAdminUser);

      expect(outboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BookingUpdatedEvent', aggregateId: mockBooking.id }),
      );
      expect(outboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BookingPriceChangedEvent', aggregateId: mockBooking.id }),
      );
    });

    it('rejects lifecycle status updates via generic update endpoint', async () => {
      flagsService.isEnabled.mockReturnValue(true);
      await expect(service.update('booking-123', { status: BookingStatus.CONFIRMED }, mockAdminUser)).rejects.toThrow(
        'booking.lifecycle_status_requires_workflow',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('treats status field as no-op when strict lifecycle flag is disabled', async () => {
      flagsService.isEnabled.mockReturnValue(false);

      const lockedBooking = {
        ...mockBooking,
        status: BookingStatus.DRAFT,
      };

      dataSource.transaction.mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(lockedBooking),
          save: jest.fn().mockResolvedValue(lockedBooking),
        }),
      );

      const result = await service.update(
        'booking-123',
        { status: BookingStatus.CONFIRMED, notes: 'noop status' },
        mockAdminUser,
      );

      expect(result.status).toBe(BookingStatus.DRAFT);
      expect(result.notes).toBe('noop status');
    });

    it('publishes only BookingUpdatedEvent when pricing does not change', async () => {
      const lockedBooking = {
        ...mockBooking,
        subTotal: 100,
        taxAmount: 10,
        totalPrice: 110,
      };
      const savedBooking = {
        ...mockBooking,
        subTotal: 100,
        taxAmount: 10,
        totalPrice: 110,
      };

      dataSource.transaction.mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(lockedBooking),
          save: jest.fn().mockResolvedValue(savedBooking),
        }),
      );

      await service.update('booking-123', { notes: 'updated notes' }, mockAdminUser);

      expect(outboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BookingUpdatedEvent', aggregateId: mockBooking.id }),
      );
    });
  });

  describe('update (draft editing - Gap 3)', () => {
    beforeEach(() => {
      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      });
    });

    it('should reject non-draft booking updates with price fields', async () => {
      const confirmedBooking = createMockBooking({
        id: 'b-confirmed',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED as unknown as BookingStatus,
        startTime: '10:00',
      });

      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(confirmedBooking),
      });

      await expect(service.update('b-confirmed', { taxRate: 15 }, mockAdminUser)).rejects.toThrow(BadRequestException);
    });

    it('should recalculate pricing when draft and price fields change', async () => {
      const draftBooking = createMockBooking({
        id: 'b-draft',
        tenantId: 'tenant-1',
        status: BookingStatus.DRAFT as unknown as BookingStatus,
        subTotal: 100,
        taxRate: 10,
        taxAmount: 10,
        totalPrice: 110,
        depositPercentage: 25,
        depositAmount: 27.5,
        packageId: 'pkg-1',
      });

      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(draftBooking),
      });

      catalogService.findPackageById.mockResolvedValue({
        id: 'pkg-2',
        price: 200,
        name: 'Premium Package',
        durationMinutes: 120,
      });

      const mockSave = jest.fn().mockImplementation((b) => b);
      dataSource.transaction.mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(draftBooking),
          save: mockSave,
        }),
      );

      await service.update('b-draft', { packageId: 'pkg-2', taxRate: 5 }, mockAdminUser);

      // Verify catalogService was called with the new package
      expect(catalogService.findPackageById).toHaveBeenCalledWith('pkg-2');
    });

    it('allows non-draft workflow metadata updates for handover type and processing types', async () => {
      const confirmedBooking = createMockBooking({
        id: 'b-confirmed',
        tenantId: 'tenant-1',
        status: BookingStatus.CONFIRMED as unknown as BookingStatus,
        startTime: '10:00',
      });
      const mockProcessingType = { id: 'pt-1', tenantId: 'tenant-1', name: 'طبع' };

      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(confirmedBooking),
      });

      const mockFind = jest.fn().mockResolvedValue([mockProcessingType]);
      const mockSave = jest.fn().mockImplementation((booking) => booking);
      dataSource.transaction.mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue({ ...confirmedBooking }),
          find: mockFind,
          save: mockSave,
        }),
      );

      await service.update(
        'b-confirmed',
        {
          handoverType: PaymentMethod.E_PAYMENT,
          processingTypeIds: ['pt-1'],
        },
        mockAdminUser,
      );

      expect(mockFind).toHaveBeenCalledWith(
        ProcessingType,
        expect.objectContaining({
          where: [{ id: 'pt-1', tenantId: 'tenant-1' }],
        }),
      );
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          handoverType: PaymentMethod.E_PAYMENT,
          processingTypes: [mockProcessingType],
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all bookings', async () => {
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBooking]),
      };

      bookingRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.findAll();

      expect(result).toEqual([mockBooking]);
      // Verify tenantId WAS used in where clause for tenant isolation
      expect(queryBuilder.where).toHaveBeenCalledWith('booking.tenantId = :tenantId', { tenantId: 'tenant-123' });
    });

    it('should filter FIELD_STAFF bookings using task assignee mapping', async () => {
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBooking]),
      };

      bookingRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.findAll(undefined, { id: 'user-1', role: Role.FIELD_STAFF } as User);

      expectFieldStaffRbacWithBackwardCompatibility(queryBuilder);
    });
  });

  describe('findAllCursor', () => {
    it('should filter FIELD_STAFF bookings using task assignee mapping and legacy assigned user fallback', async () => {
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
      };

      bookingRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      const paginateSpy = jest
        .spyOn(CursorPaginationHelper, 'paginate')
        .mockResolvedValue({ data: [mockBooking as never], nextCursor: null } as never);

      await service.findAllCursor({ limit: 10 } as never, { id: 'user-1', role: Role.FIELD_STAFF } as User);

      expectFieldStaffRbacWithBackwardCompatibility(queryBuilder);
      paginateSpy.mockRestore();
    });
  });

  describe('findOne', () => {
    it('should return a booking', async () => {
      const queryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      };

      bookingRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.findOne('booking-123');

      expect(result).toEqual(mockBooking);
      expect(bookingRepository.createQueryBuilder).toHaveBeenCalledWith('booking');
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('booking.id = :id AND booking.tenantId = :tenantId', {
        id: 'booking-123',
        tenantId: 'tenant-123',
      });
    });

    it('should filter FIELD_STAFF booking visibility using task assignee mapping and legacy assigned user fallback', async () => {
      const queryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      };

      bookingRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.findOne('booking-123', { id: 'user-1', role: Role.FIELD_STAFF } as User);

      expectFieldStaffRbacWithBackwardCompatibility(queryBuilder);
    });
  });

  describe('remove', () => {
    it('writes an audit log entry with the reason on successful deletion', async () => {
      const draftBooking = createMockBooking({
        id: 'booking-del',
        tenantId: 'tenant-1',
        status: BookingStatus.DRAFT,
        eventDate: new Date(Date.now() + 86400000),
        packageId: 'pkg-1',
      });

      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(draftBooking),
      });
      bookingRepository.softRemove.mockResolvedValue(draftBooking);

      await service.remove('booking-del', 'duplicate booking', mockAdminUser);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'booking.delete',
          entityName: 'Booking',
          entityId: 'booking-del',
          userId: mockAdminUser.id,
          notes: 'duplicate booking',
        }),
      );
    });
  });

  describe('FIELD_STAFF scoping on mutations', () => {
    const fieldStaffUser = { id: 'staff-1', role: Role.FIELD_STAFF } as User;

    beforeEach(() => {
      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
    });

    it('update throws NotFoundException for FIELD_STAFF with no assigned task', async () => {
      await expect(service.update('booking-123', { notes: 'x' }, fieldStaffUser)).rejects.toThrow(NotFoundException);
    });

    it('remove throws NotFoundException for FIELD_STAFF with no assigned task', async () => {
      await expect(service.remove('booking-123', undefined, fieldStaffUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkAvailability', () => {
    it('should return available=true with empty conflicts when staff availability is ok', async () => {
      staffConflictService.checkPackageStaffAvailability.mockResolvedValue({
        ok: true,
        requiredStaffCount: 2,
        eligibleCount: 3,
        busyCount: 1,
        availableCount: 2,
      });

      const result = await service.checkAvailability({
        packageId: 'pkg-1',
        eventDate: '2099-01-01T00:00:00.000Z',
        startTime: '09:00',
      });

      expect(result).toEqual({
        available: true,
        conflictReasons: [],
      });
    });

    it('should return BOOKING_STAFF_CONFLICT reason when unavailable', async () => {
      staffConflictService.checkPackageStaffAvailability.mockResolvedValue({
        ok: false,
        requiredStaffCount: 3,
        eligibleCount: 4,
        busyCount: 2,
        availableCount: 2,
      });

      const result = await service.checkAvailability({
        packageId: 'pkg-1',
        eventDate: '2099-01-01T00:00:00.000Z',
        startTime: '09:00',
      });

      expect(result.available).toBe(false);
      expect(result.conflictReasons).toEqual([
        {
          code: 'BOOKING_STAFF_CONFLICT',
          message: 'Requested window has staff assignment conflict',
          details: {
            requiredStaffCount: 3,
            eligibleCount: 4,
            busyCount: 2,
            availableCount: 2,
          },
        },
      ]);
    });
  });
});
