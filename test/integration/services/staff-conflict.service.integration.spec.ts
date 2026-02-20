import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { StaffConflictService } from '../../../src/modules/bookings/services/staff-conflict.service';
import { PackageItem } from '../../../src/modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../../src/modules/catalog/entities/task-type.entity';
import { TaskTypeEligibility } from '../../../src/modules/hr/entities/task-type-eligibility.entity';
import { TaskAssignee } from '../../../src/modules/tasks/entities/task-assignee.entity';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { TaskAssigneeRole } from '../../../src/modules/tasks/enums/task-assignee-role.enum';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Role } from '../../../src/modules/users/enums/role.enum';
import { PackageItemRepository } from '../../../src/modules/catalog/repositories/package-item.repository';
import { ServicePackageRepository } from '../../../src/modules/catalog/repositories/service-package.repository';
import { TaskTypeEligibilityRepository } from '../../../src/modules/hr/repositories/task-type-eligibility.repository';
import { TaskAssigneeRepository } from '../../../src/modules/tasks/repositories/task-assignee.repository';
import { TaskRepository } from '../../../src/modules/tasks/repositories/task.repository';
import { UserRepository } from '../../../src/modules/users/repositories/user.repository';

describe('StaffConflictService Integration Tests', () => {
  let dataSource: DataSource;
  let staffConflictService: StaffConflictService;

  let tenantRepository: Repository<Tenant>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let packageItemRepository: Repository<PackageItem>;
  let taskTypeRepository: Repository<TaskType>;
  let taskTypeEligibilityRepository: Repository<TaskTypeEligibility>;
  let bookingRepository: Repository<Booking>;
  let taskRepository: Repository<Task>;
  let taskAssigneeRepository: Repository<TaskAssignee>;
  let userRepository: Repository<User>;

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      ...dbConfig,
      type: 'postgres',
      entities: ['src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    tenantRepository = dataSource.getRepository(Tenant);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    packageItemRepository = dataSource.getRepository(PackageItem);
    taskTypeRepository = dataSource.getRepository(TaskType);
    taskTypeEligibilityRepository = dataSource.getRepository(TaskTypeEligibility);
    bookingRepository = dataSource.getRepository(Booking);
    taskRepository = dataSource.getRepository(Task);
    taskAssigneeRepository = dataSource.getRepository(TaskAssignee);
    userRepository = dataSource.getRepository(User);

    staffConflictService = new StaffConflictService(
      new ServicePackageRepository(packageRepository),
      new PackageItemRepository(packageItemRepository),
      new TaskTypeEligibilityRepository(taskTypeEligibilityRepository),
      new UserRepository(userRepository),
      new TaskAssigneeRepository(taskAssigneeRepository),
      new TaskRepository(taskRepository),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "task_assignees", "tasks", "bookings", "task_type_eligibilities", "package_items", "task_types", "service_packages", "clients", "users", "tenants" CASCADE',
    );
  });

  it('ignores overlapping bookings from other tenants when checking package staff availability', async () => {
    const tenant1 = uuidv4();
    const tenant2 = uuidv4();

    await tenantRepository.save([
      {
        id: tenant1,
        name: 'Tenant One',
        slug: `tenant-one-${uuidv4().slice(0, 8)}`,
      },
      {
        id: tenant2,
        name: 'Tenant Two',
        slug: `tenant-two-${uuidv4().slice(0, 8)}`,
      },
    ]);

    const eligibleUser = await userRepository.save({
      email: 'staff-tenant1@test.local',
      passwordHash: 'test-password-hash',
      role: Role.FIELD_STAFF,
      isActive: true,
      tenantId: tenant1,
    });

    const taskTypeTenant1 = await taskTypeRepository.save({
      name: 'Photography Tenant 1',
      description: 'Tenant1 task type',
      defaultCommissionAmount: 0,
      tenantId: tenant1,
    });

    const packageTenant1 = await packageRepository.save({
      name: 'Tenant1 Package',
      description: 'Tenant1 package',
      price: 2000,
      durationMinutes: 120,
      requiredStaffCount: 1,
      tenantId: tenant1,
    });

    await packageItemRepository.save({
      packageId: packageTenant1.id,
      taskTypeId: taskTypeTenant1.id,
      quantity: 1,
      tenantId: tenant1,
    });

    await taskTypeEligibilityRepository.save({
      userId: eligibleUser.id,
      taskTypeId: taskTypeTenant1.id,
      tenantId: tenant1,
    });

    const taskTypeTenant2 = await taskTypeRepository.save({
      name: 'Photography Tenant 2',
      description: 'Tenant2 task type',
      defaultCommissionAmount: 0,
      tenantId: tenant2,
    });

    const packageTenant2 = await packageRepository.save({
      name: 'Tenant2 Package',
      description: 'Tenant2 package',
      price: 2200,
      durationMinutes: 120,
      requiredStaffCount: 1,
      tenantId: tenant2,
    });

    const clientTenant2 = await clientRepository.save({
      name: 'Tenant2 Client',
      email: 'tenant2-client@test.local',
      phone: '+1000000002',
      tenantId: tenant2,
    });

    const overlappingBookingTenant2 = await bookingRepository.save({
      clientId: clientTenant2.id,
      packageId: packageTenant2.id,
      eventDate: new Date('2031-04-18T10:00:00.000Z'),
      startTime: '10:00',
      durationMinutes: 120,
      status: BookingStatus.CONFIRMED,
      totalPrice: 2200,
      subTotal: 2200,
      taxRate: 0,
      taxAmount: 0,
      depositPercentage: 0,
      depositAmount: 0,
      amountPaid: 0,
      refundAmount: 0,
      tenantId: tenant2,
    });

    const tenant2Task = await taskRepository.save({
      bookingId: overlappingBookingTenant2.id,
      taskTypeId: taskTypeTenant2.id,
      assignedUserId: null,
      parentId: null,
      status: TaskStatus.PENDING,
      commissionSnapshot: 0,
      dueDate: null,
      completedAt: null,
      notes: 'Cross-tenant leak trap task',
      tenantId: tenant2,
    });

    await dataSource.query("SET session_replication_role = 'replica'");
    try {
      await dataSource.query(
        'INSERT INTO "task_assignees" ("tenant_id", "task_id", "user_id", "role", "commission_snapshot") VALUES ($1, $2, $3, $4, $5)',
        [tenant2, tenant2Task.id, eligibleUser.id, TaskAssigneeRole.LEAD, 0],
      );
    } finally {
      await dataSource.query("SET session_replication_role = 'origin'");
    }

    const leakTrapAssignment = await taskAssigneeRepository.findOneByOrFail({
      tenantId: tenant2,
      taskId: tenant2Task.id,
      userId: eligibleUser.id,
    });

    expect(leakTrapAssignment.userId).toBe(eligibleUser.id);
    expect(leakTrapAssignment.tenantId).toBe(tenant2);

    const result = await TenantContextService.run(tenant1, () =>
      staffConflictService.checkPackageStaffAvailability({
        packageId: packageTenant1.id,
        eventDate: new Date('2031-04-18T10:00:00.000Z'),
        startTime: '10:00',
        durationMinutes: 120,
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.requiredStaffCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.busyCount).toBe(0);
    expect(result.availableCount).toBe(1);
  });
});
