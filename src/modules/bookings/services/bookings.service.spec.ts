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
  createMockDashboardGateway,
  createMockDataSource,
  createMockEventBus,
  createMockFinanceService,
  createMockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { DashboardGateway } from '../../dashboard/dashboard.gateway';
import { FinanceService } from '../../finance/services/finance.service';
import { CreateBookingDto } from '../dto';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingRepository } from '../repositories/booking.repository';
import { BookingStateMachineService } from './booking-state-machine.service';
import { BookingsService } from './bookings.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRepository: ReturnType<typeof createMockRepository>;
  let catalogService: ReturnType<typeof createMockCatalogService>;
  let financeService: ReturnType<typeof createMockFinanceService>;
  let auditService: ReturnType<typeof createMockAuditService>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let dashboardGateway: ReturnType<typeof createMockDashboardGateway>;
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
    dashboardGateway = createMockDashboardGateway();
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
          provide: DashboardGateway,
          useValue: dashboardGateway,
        },
        {
          provide: BookingStateMachineService,
          useValue: stateMachine,
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

  describe('findAll', () => {
    it('should return all bookings', async () => {
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

      const result = await service.findAll();

      expect(result).toEqual([mockBooking]);
      // Verify tenantId was used in where clause (manual check in service)
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'booking.tenantId = :tenantId',
        expect.objectContaining({ tenantId: 'tenant-123' }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a booking', async () => {
      bookingRepository.findOne.mockResolvedValue(mockBooking);

      const result = await service.findOne('booking-123');

      expect(result).toEqual(mockBooking);
      expect(bookingRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'booking-123' }, // tenantId should be implicitly handled by repo, not passed manually here
        }),
      );
      // Verify we are NOT passing tenantId manually in the where clause of findOneOptions
      const findOneCallArg = bookingRepository.findOne.mock.calls[0][0];
      // The service code: where: { id }
      // Tests that we removed tenantId from the service call.
      expect(findOneCallArg.where).not.toHaveProperty('tenantId');
    });
  });
});
