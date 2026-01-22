import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { Task } from '../../../src/modules/tasks/entities/task.entity';

describe('BookingsRepository Integration Tests', () => {
  let dataSource: DataSource;
  let bookingRepository: Repository<Booking>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let _taskRepository: Repository<Task>;

  const tenant1 = uuidv4();
  const tenant2 = uuidv4();

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: [__dirname + '/../../../src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    bookingRepository = dataSource.getRepository(Booking);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    _taskRepository = dataSource.getRepository(Task);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clean up tables before each test
    await dataSource.query('TRUNCATE TABLE "tasks", "bookings", "service_packages", "clients" CASCADE');
  });

  describe('Multi-tenant Data Isolation', () => {
    it('should isolate bookings by tenant', async () => {
      // Create clients and packages for both tenants
      const client1 = await clientRepository.save({
        name: 'Tenant 1 Client',
        email: 'client1@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const client2 = await clientRepository.save({
        name: 'Tenant 2 Client',
        email: 'client2@test.com',
        phone: '987654321',
        tenantId: tenant2,
      });

      const package1 = await packageRepository.save({
        name: 'Package 1',
        description: 'Test Package',
        price: 1000,
        tenantId: tenant1,
      });

      const package2 = await packageRepository.save({
        name: 'Package 2',
        description: 'Test Package',
        price: 2000,
        tenantId: tenant2,
      });

      // Create bookings for both tenants
      const booking1 = await bookingRepository.save({
        clientId: client1.id,
        packageId: package1.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.DRAFT,
        tenantId: tenant1,
      });

      const booking2 = await bookingRepository.save({
        clientId: client2.id,
        packageId: package2.id,
        eventDate: new Date('2026-07-01'),
        totalPrice: 2000,
        status: BookingStatus.DRAFT,
        tenantId: tenant2,
      });

      // Verify tenant 1 can only see their booking
      const tenant1Bookings = await bookingRepository.find({
        where: { tenantId: tenant1 },
      });
      expect(tenant1Bookings).toHaveLength(1);
      expect(tenant1Bookings[0].id).toBe(booking1.id);

      // Verify tenant 2 can only see their booking
      const tenant2Bookings = await bookingRepository.find({
        where: { tenantId: tenant2 },
      });
      expect(tenant2Bookings).toHaveLength(1);
      expect(tenant2Bookings[0].id).toBe(booking2.id);
    });

    it('should enforce composite foreign key constraints', async () => {
      // Create client and package for tenant 1
      const client1 = await clientRepository.save({
        name: 'Tenant 1 Client',
        email: 'client1@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const package2 = await packageRepository.save({
        name: 'Package 2',
        description: 'Tenant 2 Package',
        price: 2000,
        tenantId: tenant2,
      });

      // Attempt to create booking with mismatched tenant IDs
      // This should fail due to composite foreign key constraints
      await expect(
        bookingRepository.save({
          clientId: client1.id,
          packageId: package2.id, // Different tenant's package
          eventDate: new Date('2026-06-01'),
          totalPrice: 2000,
          status: BookingStatus.DRAFT,
          tenantId: tenant1,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Complex Queries with Joins', () => {
    it('should load booking with all relations', async () => {
      // Setup test data
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Wedding Package',
        description: 'Complete wedding photography',
        price: 5000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 5000,
        status: BookingStatus.CONFIRMED,
        notes: 'VIP client',
        tenantId: tenant1,
      });

      // Query with relations
      const result = await bookingRepository.findOne({
        where: { id: booking.id, tenantId: tenant1 },
        relations: ['client', 'servicePackage'],
      });

      expect(result).toBeDefined();
      expect(result?.client.name).toBe('Test Client');
      expect(result?.servicePackage.name).toBe('Wedding Package');
      expect(Number(result?.totalPrice)).toBe(5000);
    });

    it('should handle pagination correctly', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 1000,
        tenantId: tenant1,
      });

      // Create 15 bookings
      for (let i = 0; i < 15; i++) {
        await bookingRepository.save({
          clientId: client.id,
          packageId: pkg.id,
          eventDate: new Date(`2026-0${(i % 9) + 1}-01`),
          totalPrice: 1000,
          status: BookingStatus.DRAFT,
          tenantId: tenant1,
        });
      }

      // Test pagination
      const page1 = await bookingRepository.find({
        where: { tenantId: tenant1 },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });

      const page2 = await bookingRepository.find({
        where: { tenantId: tenant1 },
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(5);

      // Ensure no overlap
      const page1Ids = page1.map((b) => b.id);
      const page2Ids = page2.map((b) => b.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('Transaction Rollback Scenarios', () => {
    it('should rollback transaction on error', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 1000,
        tenantId: tenant1,
      });

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Create booking in transaction
        await queryRunner.manager.save(Booking, {
          clientId: client.id,
          packageId: pkg.id,
          eventDate: new Date('2026-06-01'),
          totalPrice: 1000,
          status: BookingStatus.DRAFT,
          tenantId: tenant1,
        });

        // Simulate error
        throw new Error('Simulated error');
      } catch {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      // Verify booking was not created
      const bookings = await bookingRepository.find({
        where: { tenantId: tenant1 },
      });
      expect(bookings).toHaveLength(0);
    });
  });

  describe('Status Transitions', () => {
    it('should track booking status changes', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 1000,
        tenantId: tenant1,
      });

      const booking: Booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.DRAFT,
        tenantId: tenant1,
      });

      // Update to confirmed
      booking.status = BookingStatus.CONFIRMED;
      await bookingRepository.save(booking);

      const confirmed = await bookingRepository.findOne({
        where: { id: booking.id },
      });
      expect(confirmed?.status).toBe(BookingStatus.CONFIRMED);

      // Update to completed
      booking.status = BookingStatus.COMPLETED;
      await bookingRepository.save(booking);

      const completed = await bookingRepository.findOne({
        where: { id: booking.id },
      });
      expect(completed?.status).toBe(BookingStatus.COMPLETED);
    });
  });
});
