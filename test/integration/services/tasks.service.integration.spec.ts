import { EventBus } from '@nestjs/cqrs';
import { ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../../src/modules/catalog/entities/task-type.entity';
import { AuditService } from '../../../src/modules/audit/audit.service';
import { FinanceService } from '../../../src/modules/finance/services/finance.service';
import { WalletService } from '../../../src/modules/finance/services/wallet.service';
import { TaskAssignee } from '../../../src/modules/tasks/entities/task-assignee.entity';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { TaskAssigneeRole } from '../../../src/modules/tasks/enums/task-assignee-role.enum';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { TaskAssigneeRepository } from '../../../src/modules/tasks/repositories/task-assignee.repository';
import { TaskRepository } from '../../../src/modules/tasks/repositories/task.repository';
import { TasksService } from '../../../src/modules/tasks/services/tasks.service';
import { TasksExportService } from '../../../src/modules/tasks/services/tasks-export.service';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Role } from '../../../src/modules/users/enums/role.enum';

describe('TasksService Integration Tests', () => {
  let dataSource: DataSource;
  let tasksService: TasksService;

  let tenantRepository: Repository<Tenant>;
  let userRepository: Repository<User>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let bookingRepository: Repository<Booking>;
  let taskTypeRepository: Repository<TaskType>;
  let taskRepository: Repository<Task>;
  let taskAssigneeRepository: Repository<TaskAssignee>;

  const createBookingAndTaskType = async (
    tenantId: string,
    label: string,
  ): Promise<{ booking: Booking; taskType: TaskType }> => {
    const client = await clientRepository.save({
      name: `${label} Client`,
      email: `${label.toLowerCase()}-${uuidv4()}@test.local`,
      phone: `+1${uuidv4().replace(/-/g, '').slice(0, 10)}`,
      tenantId,
    });

    const servicePackage = await packageRepository.save({
      name: `${label} Package`,
      description: `${label} package`,
      price: 2000,
      durationMinutes: 90,
      requiredStaffCount: 1,
      tenantId,
    });

    const booking = await bookingRepository.save({
      clientId: client.id,
      packageId: servicePackage.id,
      eventDate: new Date('2032-01-11T09:00:00.000Z'),
      startTime: '09:00',
      durationMinutes: 90,
      status: BookingStatus.CONFIRMED,
      totalPrice: 2000,
      subTotal: 2000,
      taxRate: 0,
      taxAmount: 0,
      depositPercentage: 0,
      depositAmount: 0,
      amountPaid: 0,
      refundAmount: 0,
      tenantId,
    });

    const taskType = await taskTypeRepository.save({
      name: `${label} TaskType`,
      description: `${label} task type`,
      defaultCommissionAmount: 0,
      tenantId,
    });

    return { booking, taskType };
  };

  const createTask = async (params: {
    tenantId: string;
    bookingId: string;
    taskTypeId: string;
    assignedUserId: string | null;
    notes: string;
  }): Promise<Task> => {
    return taskRepository.save({
      bookingId: params.bookingId,
      taskTypeId: params.taskTypeId,
      assignedUserId: params.assignedUserId,
      parentId: null,
      status: TaskStatus.PENDING,
      commissionSnapshot: 0,
      dueDate: null,
      completedAt: null,
      notes: params.notes,
      tenantId: params.tenantId,
    });
  };

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
    userRepository = dataSource.getRepository(User);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    bookingRepository = dataSource.getRepository(Booking);
    taskTypeRepository = dataSource.getRepository(TaskType);
    taskRepository = dataSource.getRepository(Task);
    taskAssigneeRepository = dataSource.getRepository(TaskAssignee);

    tasksService = new TasksService(
      new TaskRepository(taskRepository),
      {
        transferPendingCommission: jest.fn(),
      } as unknown as FinanceService,
      {
        moveToPayable: jest.fn(),
      } as unknown as WalletService,
      {
        log: jest.fn(),
      } as unknown as AuditService,
      dataSource,
      {
        publish: jest.fn(),
      } as unknown as EventBus,
      {
        exportToCSV: jest.fn(),
      } as unknown as TasksExportService,
      new TaskAssigneeRepository(taskAssigneeRepository),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "task_assignees", "tasks", "task_types", "bookings", "service_packages", "clients", "users", "tenants" CASCADE',
    );
  });

  it('keeps findByUser tenant-isolated even with a leak-trap cross-tenant assigned_user_id row', async () => {
    const tenant1 = uuidv4();
    const tenant2 = uuidv4();

    await tenantRepository.save([
      { id: tenant1, name: 'Tenant One', slug: `tasks-tenant-one-${uuidv4().slice(0, 8)}` },
      { id: tenant2, name: 'Tenant Two', slug: `tasks-tenant-two-${uuidv4().slice(0, 8)}` },
    ]);

    const tenant1FieldStaff = await userRepository.save({
      email: `fieldstaff-${uuidv4()}@tenant1.local`,
      passwordHash: 'hash',
      role: Role.FIELD_STAFF,
      isActive: true,
      emailVerified: true,
      isMfaEnabled: false,
      tenantId: tenant1,
    });

    const tenant1Fixture = await createBookingAndTaskType(tenant1, 'Tenant1');
    const tenant1Task = await createTask({
      tenantId: tenant1,
      bookingId: tenant1Fixture.booking.id,
      taskTypeId: tenant1Fixture.taskType.id,
      assignedUserId: tenant1FieldStaff.id,
      notes: 'tenant1-task',
    });

    const tenant2Fixture = await createBookingAndTaskType(tenant2, 'Tenant2');
    const tenant2LeakTrapTaskId = uuidv4();

    try {
      await taskRepository.save({
        id: tenant2LeakTrapTaskId,
        bookingId: tenant2Fixture.booking.id,
        taskTypeId: tenant2Fixture.taskType.id,
        assignedUserId: tenant1FieldStaff.id,
        parentId: null,
        status: TaskStatus.PENDING,
        commissionSnapshot: 0,
        dueDate: null,
        completedAt: null,
        notes: 'tenant2-leak-trap-task',
        tenantId: tenant2,
      });
    } catch {
      await dataSource.query("SET session_replication_role = 'replica'");
      try {
        await dataSource.query(
          'INSERT INTO "tasks" ("id", "booking_id", "task_type_id", "assigned_user_id", "parent_id", "status", "commission_snapshot", "due_date", "completed_at", "notes", "tenant_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [
            tenant2LeakTrapTaskId,
            tenant2Fixture.booking.id,
            tenant2Fixture.taskType.id,
            tenant1FieldStaff.id,
            null,
            TaskStatus.PENDING,
            0,
            null,
            null,
            'tenant2-leak-trap-task',
            tenant2,
          ],
        );
      } finally {
        await dataSource.query("SET session_replication_role = 'origin'");
      }
    }

    const tenant1Tasks = await TenantContextService.run(tenant1, () => tasksService.findByUser(tenant1FieldStaff.id));

    expect(tenant1Tasks.map((task) => task.id)).toContain(tenant1Task.id);
    expect(tenant1Tasks.map((task) => task.id)).not.toContain(tenant2LeakTrapTaskId);
    expect(tenant1Tasks.every((task) => task.tenantId === tenant1)).toBe(true);
  });

  it('forbids FIELD_STAFF from reading task assignees when they are neither assigned nor listed', async () => {
    const tenant1 = uuidv4();
    await tenantRepository.save({
      id: tenant1,
      name: 'Tenant One',
      slug: `tasks-field-staff-${uuidv4().slice(0, 8)}`,
    });

    const fieldStaff = await userRepository.save({
      email: `fieldstaff-${uuidv4()}@tenant.local`,
      passwordHash: 'hash',
      role: Role.FIELD_STAFF,
      isActive: true,
      emailVerified: true,
      isMfaEnabled: false,
      tenantId: tenant1,
    });

    const leadUser = await userRepository.save({
      email: `lead-${uuidv4()}@tenant.local`,
      passwordHash: 'hash',
      role: Role.FIELD_STAFF,
      isActive: true,
      emailVerified: true,
      isMfaEnabled: false,
      tenantId: tenant1,
    });

    const fixture = await createBookingAndTaskType(tenant1, 'Tenant1-Forbidden');
    const task = await createTask({
      tenantId: tenant1,
      bookingId: fixture.booking.id,
      taskTypeId: fixture.taskType.id,
      assignedUserId: leadUser.id,
      notes: 'field-staff-forbidden-task',
    });

    await taskAssigneeRepository.save({
      tenantId: tenant1,
      taskId: task.id,
      userId: leadUser.id,
      role: TaskAssigneeRole.LEAD,
      commissionSnapshot: 0,
    });

    await expect(
      TenantContextService.run(tenant1, () => tasksService.listTaskAssignees(task.id, fieldStaff)),
    ).rejects.toThrow(ForbiddenException);
  });
});
