import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  createMockAuditService,
  createMockBooking,
  createMockBookingStateMachine,
  createMockCatalogService,
  createMockDataSource,
  createMockEventBus,
  createMockFinanceService,
  createMockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { CreateBookingDto } from '../dto';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { BookingPriceChangedEvent } from '../events/booking-price-changed.event';
import { BookingUpdatedEvent } from '../events/booking-updated.event';
import { PaymentRecordedEvent } from '../events/payment-recorded.event';
import { BookingRepository } from '../repositories/booking.repository';
import { BookingStateMachineService } from './booking-state-machine.service';
import { BookingsService } from './bookings.service';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRepository: ReturnType<typeof createMockRepository>;
  let catalogService: ReturnType<typeof createMockCatalogService>;
  let financeService: ReturnType<typeof createMockFinanceService>;
  let auditService: ReturnType<typeof createMockAuditService>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let stateMachine: ReturnType<typeof createMockBookingStateMachine>;

  const mockBooking = createMockBooking({
    id: 'booking-123',
    tenantId: 'tenant-1',
    status: BookingStatus.DRAFT,
    eventDate: new Date(Date.now() + 86400000), // tomorrow
    clientId: 'client-1',
    packageId: 'pkg-1',
  });

  beforeEach(async () => {
    mockTenantContext('tenant-123');

    bookingRepository = createMockRepository();
    catalogService = createMockCatalogService();
    financeService = createMockFinanceService();
    auditService = createMockAuditService();
    dataSource = createMockDataSource();
    eventBus = createMockEventBus();
    stateMachine = createMockBookingStateMachine();

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
        {
          provide: BookingRepository,
          useValue: bookingRepository,
        },
        {
          provide: CatalogService,
          useValue: catalogService,
        },
        {
          provide: FinanceService,
          useValue: financeService,
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
          provide: EventBus,
          useValue: eventBus,
        },
        {
          provide: BookingStateMachineService,
          useValue: stateMachine,
        },
        {
          provide: CacheUtilsService,
          useValue: {
            del: jest.fn(),
            invalidateByPattern: jest.fn(),
            set: jest.fn(),
            get: jest.fn(),
          },
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

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingCreatedEvent));
    });

    it('should round tax amount to 2 decimal places', async () => {
      const dto: CreateBookingDto = {
        clientId: 'client-1',
        packageId: 'pkg-1',
        eventDate: new Date(Date.now() + 86400000).toISOString(),
        taxRate: 10.125,
      };

      catalogService.findPackageById.mockResolvedValue({ price: 100 });
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

      await service.update('booking-123', { notes: 'updated notes' });

      expect(eventBus.publish).toHaveBeenCalledTimes(2);
      expect(eventBus.publish).toHaveBeenNthCalledWith(1, expect.any(BookingUpdatedEvent));
      expect(eventBus.publish).toHaveBeenNthCalledWith(2, expect.any(BookingPriceChangedEvent));
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

      await service.update('booking-123', { notes: 'updated notes' });

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingUpdatedEvent));
    });
  });

  describe('recordPayment', () => {
    it('publishes PaymentRecordedEvent once after successful payment write', async () => {
      const foundBooking = {
        ...mockBooking,
        amountPaid: 0,
        totalPrice: 1000,
        client: { email: 'client@example.com', name: 'Client' },
      };

      bookingRepository.createQueryBuilder.mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapMany: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(foundBooking),
      });

      dataSource.transaction.mockImplementation((cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(foundBooking),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      );

      await service.recordPayment('booking-123', { amount: 250, paymentMethod: 'CARD', reference: 'ref-1' });

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(PaymentRecordedEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as PaymentRecordedEvent;
      expect(event.bookingId).toBe('booking-123');
      expect(event.amount).toBe(250);
      expect(event.tenantId).toBe('tenant-1');
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
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('booking.id = :id', { id: 'booking-123' });
    });
  });
});
