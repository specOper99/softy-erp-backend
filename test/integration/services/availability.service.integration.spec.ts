import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AvailabilityCacheOwnerService } from '../../../src/common/cache/availability-cache-owner.service';
import { CacheUtilsService } from '../../../src/common/cache/cache-utils.service';
import { AvailabilityService } from '../../../src/modules/client-portal/services/availability.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { BookingRepository } from '../../../src/modules/bookings/repositories/booking.repository';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { ServicePackageRepository } from '../../../src/modules/catalog/repositories/service-package.repository';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';

class InMemoryCacheUtilsStub {
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T, _ttlMs: number): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('AvailabilityService Integration Tests', () => {
  let dataSource: DataSource;
  let availabilityService: AvailabilityService;
  let availabilityCacheOwner: AvailabilityCacheOwnerService;

  let bookingTypeOrmRepository: Repository<Booking>;
  let clientRepository: Repository<Client>;
  let packageTypeOrmRepository: Repository<ServicePackage>;
  let tenantRepository: Repository<Tenant>;

  const testDate = '2031-04-18';
  const overlappingDate = new Date('2031-04-18T10:00:00.000Z');

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      ...dbConfig,
      type: 'postgres',
      entities: ['src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    bookingTypeOrmRepository = dataSource.getRepository(Booking);
    clientRepository = dataSource.getRepository(Client);
    packageTypeOrmRepository = dataSource.getRepository(ServicePackage);
    tenantRepository = dataSource.getRepository(Tenant);

    availabilityCacheOwner = new AvailabilityCacheOwnerService(
      new InMemoryCacheUtilsStub() as unknown as CacheUtilsService,
    );

    availabilityService = new AvailabilityService(
      availabilityCacheOwner,
      new BookingRepository(bookingTypeOrmRepository),
      new ServicePackageRepository(packageTypeOrmRepository),
      tenantRepository,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "bookings", "clients", "service_packages", "tenants" CASCADE');
  });

  it('keeps availability tenant-scoped and cache keys separated by tenant', async () => {
    const tenant1 = uuidv4();
    const tenant2 = uuidv4();

    await tenantRepository.save([
      {
        id: tenant1,
        name: 'Availability Tenant One',
        slug: `availability-tenant-one-${uuidv4().slice(0, 8)}`,
        minimumNoticePeriodHours: 0,
        maxAdvanceBookingDays: 36500,
        workingHours: [
          { day: 'monday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'tuesday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'wednesday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'thursday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'friday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'saturday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'sunday', startTime: '09:00', endTime: '17:00', isOpen: true },
        ],
      },
      {
        id: tenant2,
        name: 'Availability Tenant Two',
        slug: `availability-tenant-two-${uuidv4().slice(0, 8)}`,
        minimumNoticePeriodHours: 0,
        maxAdvanceBookingDays: 36500,
        workingHours: [
          { day: 'monday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'tuesday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'wednesday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'thursday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'friday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'saturday', startTime: '09:00', endTime: '17:00', isOpen: true },
          { day: 'sunday', startTime: '09:00', endTime: '17:00', isOpen: true },
        ],
      },
    ]);

    const tenant1Package = await packageTypeOrmRepository.save({
      name: 'Tenant1 Availability Package',
      description: 'Tenant1 package used for availability test',
      price: 2000,
      durationMinutes: 120,
      requiredStaffCount: 1,
      tenantId: tenant1,
    });

    const tenant2Client = await clientRepository.save({
      name: 'Tenant2 Availability Client',
      email: 'availability-tenant2-client@test.local',
      phone: '+1000000002',
      tenantId: tenant2,
    });

    try {
      await bookingTypeOrmRepository.save({
        clientId: tenant2Client.id,
        packageId: tenant1Package.id,
        eventDate: overlappingDate,
        startTime: '10:00',
        durationMinutes: 120,
        status: BookingStatus.CONFIRMED,
        totalPrice: 2000,
        subTotal: 2000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        tenantId: tenant2,
      });
    } catch {
      await dataSource.query("SET session_replication_role = 'replica'");
      try {
        await dataSource.query(
          [
            'INSERT INTO "bookings"',
            '("tenant_id", "client_id", "event_date", "start_time", "duration_minutes", "status", "total_price", "sub_total", "tax_rate", "tax_amount", "package_id", "deposit_percentage", "deposit_amount", "amount_paid", "refund_amount", "payment_status")',
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)',
          ].join(' '),
          [
            tenant2,
            tenant2Client.id,
            overlappingDate,
            '10:00',
            120,
            BookingStatus.CONFIRMED,
            2000,
            2000,
            0,
            0,
            tenant1Package.id,
            0,
            0,
            0,
            0,
            'UNPAID',
          ],
        );
      } finally {
        await dataSource.query("SET session_replication_role = 'origin'");
      }
    }

    const availability = await availabilityService.checkAvailability(tenant1, tenant1Package.id, testDate);
    const tenAMSlot = availability.timeSlots.find((slot) => slot.start === '10:00');

    expect(availability.available).toBe(true);
    expect(tenAMSlot).toBeDefined();
    expect(tenAMSlot?.booked).toBe(0);
    expect(tenAMSlot?.available).toBe(true);

    const tenant1Key = availabilityCacheOwner.getKey(tenant1, tenant1Package.id, testDate);
    const tenant2Key = availabilityCacheOwner.getKey(tenant2, tenant1Package.id, testDate);
    expect(tenant1Key).not.toBe(tenant2Key);

    const tenant1CachedResponse = {
      available: true,
      date: testDate,
      timeSlots: [],
    };
    await availabilityCacheOwner.setAvailability(tenant1, tenant1Package.id, testDate, tenant1CachedResponse);
    const tenant2CachedResponse = await availabilityCacheOwner.getAvailability(tenant2, tenant1Package.id, testDate);
    expect(tenant2CachedResponse).toBeUndefined();
  });
});
