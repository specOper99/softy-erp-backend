import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ExportService } from '../../../src/common/services/export.service';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { AuditService } from '../../../src/modules/audit/audit.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { BookingStateMachineService } from '../../../src/modules/bookings/services/booking-state-machine.service';
import { BookingsService } from '../../../src/modules/bookings/services/bookings.service';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { CatalogService } from '../../../src/modules/catalog/services/catalog.service';
import { DashboardGateway } from '../../../src/modules/dashboard/dashboard.gateway';
import { FinanceService } from '../../../src/modules/finance/services/finance.service';

describe('BookingsService Integration Tests', () => {
  let module: TestingModule;
  let service: BookingsService;
  let dataSource: DataSource;
  let bookingRepository: Repository<Booking>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;

  const tenant1 = uuidv4();

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      ...dbConfig,
      type: 'postgres',
      entities: ['src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    bookingRepository = dataSource.getRepository(Booking);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);

    // Create test module with real repositories
    module = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: bookingRepository,
        },
        {
          provide: getRepositoryToken(Client),
          useValue: clientRepository,
        },
        {
          provide: getRepositoryToken(ServicePackage),
          useValue: packageRepository,
        },
        {
          provide: FinanceService,
          useValue: {
            createTransaction: jest.fn().mockResolvedValue({ id: uuidv4() }),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CatalogService,
          useValue: {
            findPackageById: jest.fn().mockImplementation((id) => packageRepository.findOneBy({ id })),
          },
        },
        {
          provide: ExportService,
          useValue: {
            streamFromStream: jest.fn(),
          },
        },
        {
          provide: DashboardGateway,
          useValue: {
            broadcastMetricsUpdate: jest.fn(),
          },
        },
        {
          provide: BookingStateMachineService,
          useValue: {
            validateTransition: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MAX_TASKS_PER_BOOKING') return 50;
              return undefined;
            }),
          },
        },
        {
          provide: EventBus,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  afterAll(async () => {
    await module?.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await bookingRepository.createQueryBuilder().delete().execute();
    await packageRepository.createQueryBuilder().delete().execute();
    await clientRepository.createQueryBuilder().delete().execute();

    // Mock tenant context
    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenant1);
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenant1);
  });

  describe('create', () => {
    it('should create booking with service integration', async () => {
      // Setup test data
      const client = await clientRepository.save({
        name: 'Integration Test Client',
        email: 'integration@test.com',
        phone: '+1234567890',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Integration Test Package',
        description: 'Full service',
        price: 3000,
        tenantId: tenant1,
      });

      // Create booking through service
      const result = await service.create({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-08-15').toISOString(),
        notes: 'Service integration test',
      });

      expect(result).toBeDefined();
      expect(result.clientId).toBe(client.id);
      expect(result.packageId).toBe(pkg.id);
      expect(result.status).toBe(BookingStatus.DRAFT);
      expect(result.totalPrice).toBe(3000);

      // Verify database persistence
      const persisted = await bookingRepository.findOne({
        where: { id: result.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted?.totalPrice).toBe('3000.00');
    });

    it('should enforce tenant isolation in service layer', async () => {
      const tenant2 = uuidv4();

      // Create package for tenant2
      const pkg = await packageRepository.save({
        name: 'Tenant 2 Package',
        description: 'Different tenant',
        price: 5000,
        tenantId: tenant2,
      });

      const client = await clientRepository.save({
        name: 'Tenant 1 Client',
        email: 'tenant1@test.com',
        phone: '+1234567890',
        tenantId: tenant1,
      });

      // Attempt to create booking with cross-tenant package
      await expect(
        service.create({
          clientId: client.id,
          packageId: pkg.id,
          eventDate: new Date('2026-08-15').toISOString(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('findOne with relations', () => {
    it('should load all relations correctly', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'test@example.com',
        phone: '+1234567890',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Premium Package',
        description: 'All inclusive',
        price: 10000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-09-01'),
        totalPrice: 10000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      // Use service to fetch with relations
      const result = await service.findOne(booking.id);

      expect(result).toBeDefined();
      expect(result.client).toBeDefined();
      expect(result.client.name).toBe('Test Client');
      expect(result.servicePackage).toBeDefined();
      expect(result.servicePackage.name).toBe('Premium Package');
    });
  });

  describe('cancelBooking with audit', () => {
    it('should cancel booking and create audit log', async () => {
      const client = await clientRepository.save({
        name: 'Cancel Test Client',
        email: 'cancel@test.com',
        phone: '+1234567890',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Cancellable Package',
        description: 'Test',
        price: 2000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-10-01'),
        totalPrice: 2000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const auditService = module.get(AuditService);

      // Cancel through service
      const result = await service.cancelBooking(booking.id);

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entityName: 'Booking',
          entityId: booking.id,
        }),
      );
    });
  });
});
