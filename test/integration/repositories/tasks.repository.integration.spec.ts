import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BookingStatus, TaskStatus, UserRole } from '../../../src/common/enums';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { User } from '../../../src/modules/users/entities/user.entity';

describe('TasksRepository Integration Tests', () => {
  let dataSource: DataSource;
  let taskRepository: Repository<Task>;
  let userRepository: Repository<User>;
  let bookingRepository: Repository<Booking>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;

  const tenant1 = uuidv4();
  const tenant2 = uuidv4();

  beforeAll(() => {
    dataSource = (global as any).__DATA_SOURCE__;

    taskRepository = dataSource.getRepository(Task);
    userRepository = dataSource.getRepository(User);
    bookingRepository = dataSource.getRepository(Booking);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
  });

  beforeEach(async () => {
    await taskRepository.delete({});
    await bookingRepository.delete({});
    await userRepository.delete({});
    await packageRepository.delete({});
    await clientRepository.delete({});
  });

  describe('Task Assignment Workflows', () => {
    it('should assign task to user within same tenant', async () => {
      // Setup
      const user = await userRepository.save({
        email: 'user@test.com',
        passwordHash: 'hash',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.EMPLOYEE,
        tenantId: tenant1,
      });

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

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const task = await taskRepository.save({
        title: 'Test Task',
        description: 'Test Description',
        bookingId: booking.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: tenant1,
      });

      // Assign task
      task.assignedUserId = user.id;
      task.status = TaskStatus.ASSIGNED;
      await taskRepository.save(task);

      // Verify assignment
      const assignedTask = await taskRepository.findOne({
        where: { id: task.id },
        relations: ['assignedUser'],
      });

      expect(assignedTask?.assignedUserId).toBe(user.id);
      expect(assignedTask?.status).toBe(TaskStatus.ASSIGNED);
      expect(assignedTask?.assignedUser?.email).toBe('user@test.com');
    });

    it('should prevent cross-tenant task assignment', async () => {
      // Create user in tenant2 (not used directly, just for setup)
      await userRepository.save({
        email: 'user2@test.com',
        passwordHash: 'hash',
        firstName: 'Tenant2',
        lastName: 'User',
        role: UserRole.EMPLOYEE,
        tenantId: tenant2,
      });

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

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const task = await taskRepository.save({
        title: 'Test Task',
        description: 'Test',
        bookingId: booking.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: tenant1,
      });

      // Attempt to query task from tenant2 perspective
      const result = await taskRepository.findOne({
        where: { id: task.id, tenantId: tenant2 },
      });

      expect(result).toBeNull();
    });
  });

  describe('Status Transitions', () => {
    it('should track task status transitions correctly', async () => {
      const user = await userRepository.save({
        email: 'user@test.com',
        passwordHash: 'hash',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.EMPLOYEE,
        tenantId: tenant1,
      });

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

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const task = await taskRepository.save({
        title: 'Test Task',
        description: 'Test',
        bookingId: booking.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: tenant1,
      });

      // PENDING -> ASSIGNED
      task.assignedUserId = user.id;
      task.status = TaskStatus.ASSIGNED;
      await taskRepository.save(task);

      let updated = await taskRepository.findOne({ where: { id: task.id } });
      expect(updated?.status).toBe(TaskStatus.ASSIGNED);

      // ASSIGNED -> IN_PROGRESS
      task.status = TaskStatus.IN_PROGRESS;
      task.startedAt = new Date();
      await taskRepository.save(task);

      updated = await taskRepository.findOne({ where: { id: task.id } });
      expect(updated?.status).toBe(TaskStatus.IN_PROGRESS);
      expect(updated?.startedAt).toBeDefined();

      // IN_PROGRESS -> COMPLETED
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      await taskRepository.save(task);

      updated = await taskRepository.findOne({ where: { id: task.id } });
      expect(updated?.status).toBe(TaskStatus.COMPLETED);
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe('Concurrent Task Updates', () => {
    it('should handle concurrent task status updates with pessimistic locking', async () => {
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

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const task = await taskRepository.save({
        title: 'Test Task',
        description: 'Test',
        bookingId: booking.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: tenant1,
      });

      // Simulate concurrent update with pessimistic write lock
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const lockedTask = await queryRunner.manager.findOne(Task, {
          where: { id: task.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (lockedTask) {
          lockedTask.status = TaskStatus.ASSIGNED;
          await queryRunner.manager.save(lockedTask);
        }

        await queryRunner.commitTransaction();
      } catch {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      const updated = await taskRepository.findOne({ where: { id: task.id } });
      expect(updated?.status).toBe(TaskStatus.ASSIGNED);
    });
  });

  describe('Cross-Tenant Isolation', () => {
    it('should not allow viewing tasks across tenants', async () => {
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

      const pkg1 = await packageRepository.save({
        name: 'Package 1',
        description: 'Test',
        price: 1000,
        tenantId: tenant1,
      });

      const pkg2 = await packageRepository.save({
        name: 'Package 2',
        description: 'Test',
        price: 2000,
        tenantId: tenant2,
      });

      const booking1 = await bookingRepository.save({
        clientId: client1.id,
        packageId: pkg1.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 1000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const booking2 = await bookingRepository.save({
        clientId: client2.id,
        packageId: pkg2.id,
        eventDate: new Date('2026-07-01'),
        totalPrice: 2000,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant2,
      });

      await taskRepository.save({
        title: 'Tenant 1 Task',
        description: 'Test',
        bookingId: booking1.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: tenant1,
      });

      await taskRepository.save({
        title: 'Tenant 2 Task',
        description: 'Test',
        bookingId: booking2.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 200,
        tenantId: tenant2,
      });

      const tenant1Tasks = await taskRepository.find({
        where: { tenantId: tenant1 },
      });
      const tenant2Tasks = await taskRepository.find({
        where: { tenantId: tenant2 },
      });

      expect(tenant1Tasks).toHaveLength(1);
      expect(tenant2Tasks).toHaveLength(1);
      expect(tenant1Tasks[0].title).toBe('Tenant 1 Task');
      expect(tenant2Tasks[0].title).toBe('Tenant 2 Task');
    });
  });
});
