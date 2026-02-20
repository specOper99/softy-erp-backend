import { EventBus } from '@nestjs/cqrs';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { BookingRepository } from '../../../src/modules/bookings/repositories/booking.repository';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../../src/modules/catalog/entities/task-type.entity';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';
import { TransactionRepository } from '../../../src/modules/finance/repositories/transaction.repository';
import { Profile } from '../../../src/modules/hr/entities/profile.entity';
import { ProfileRepository } from '../../../src/modules/hr/repositories/profile.repository';
import { StorageService } from '../../../src/modules/media/storage.service';
import {
  PrivacyRequest,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from '../../../src/modules/privacy/entities/privacy-request.entity';
import { PrivacyRequestRepository } from '../../../src/modules/privacy/repositories/privacy-request.repository';
import { PrivacyService } from '../../../src/modules/privacy/privacy.service';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { TaskRepository } from '../../../src/modules/tasks/repositories/task.repository';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Role } from '../../../src/modules/users/enums/role.enum';
import { UserRepository } from '../../../src/modules/users/repositories/user.repository';

type CapturedExportData = {
  user: { id: string; email: string };
  profile: { firstName?: string; lastName?: string } | null;
  tasks: Array<{ id: string }>;
  bookings: Array<{ id: string }>;
  transactions: Array<{ id: string }>;
};

describe('PrivacyService Integration Tests', () => {
  let dataSource: DataSource;
  let privacyService: PrivacyService;
  let storageService: { uploadFile: jest.Mock; getPresignedDownloadUrl: jest.Mock };

  let userRepo: Repository<User>;
  let profileRepo: Repository<Profile>;
  let clientRepo: Repository<Client>;
  let packageRepo: Repository<ServicePackage>;
  let bookingRepo: Repository<Booking>;
  let taskTypeRepo: Repository<TaskType>;
  let taskRepo: Repository<Task>;
  let transactionRepo: Repository<Transaction>;
  let privacyRequestRepo: Repository<PrivacyRequest>;

  const TENANT_1_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_2_ID = '22222222-2222-4222-8222-222222222222';
  const TARGET_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const TENANT_1_CLIENT_ID = 'c1111111-1111-4111-8111-111111111111';
  const TENANT_2_CLIENT_ID = 'c2222222-2222-4222-8222-222222222222';
  const TENANT_1_PACKAGE_ID = 'd1111111-1111-4111-8111-111111111111';
  const TENANT_2_PACKAGE_ID = 'd2222222-2222-4222-8222-222222222222';
  const TENANT_1_BOOKING_ID = 'b1111111-1111-4111-8111-111111111111';
  const TENANT_2_BOOKING_ID = 'b2222222-2222-4222-8222-222222222222';
  const TENANT_1_TASK_TYPE_ID = 'e1111111-1111-4111-8111-111111111111';
  const TENANT_2_TASK_TYPE_ID = 'e2222222-2222-4222-8222-222222222222';
  const TENANT_1_TASK_ID = 'f1111111-1111-4111-8111-111111111111';
  const LEAK_TRAP_TASK_ID = 'f2222222-2222-4222-8222-222222222222';
  const TENANT_1_TRANSACTION_ID = 'ab111111-1111-4111-8111-111111111111';
  const LEAK_TRAP_TRANSACTION_ID = 'ab222222-2222-4222-8222-222222222222';
  const PRIVACY_REQUEST_ID = 'aa333333-3333-4333-8333-333333333333';

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      ...dbConfig,
      type: 'postgres',
      entities: ['src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    userRepo = dataSource.getRepository(User);
    profileRepo = dataSource.getRepository(Profile);
    clientRepo = dataSource.getRepository(Client);
    packageRepo = dataSource.getRepository(ServicePackage);
    bookingRepo = dataSource.getRepository(Booking);
    taskTypeRepo = dataSource.getRepository(TaskType);
    taskRepo = dataSource.getRepository(Task);
    transactionRepo = dataSource.getRepository(Transaction);
    privacyRequestRepo = dataSource.getRepository(PrivacyRequest);

    storageService = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://example.local/privacy-export.zip'),
    };

    privacyService = new PrivacyService(
      new PrivacyRequestRepository(privacyRequestRepo),
      new UserRepository(userRepo),
      new BookingRepository(bookingRepo),
      new TaskRepository(taskRepo),
      new TransactionRepository(transactionRepo),
      new ProfileRepository(profileRepo),
      storageService as unknown as StorageService,
      { publish: jest.fn() } as unknown as EventBus,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await dataSource.query(
      'TRUNCATE TABLE "privacy_requests", "transactions", "tasks", "task_types", "bookings", "service_packages", "clients", "profiles", "users" CASCADE',
    );
  });

  it('exports only tenant-scoped task/booking/transaction data for the target user', async () => {
    await userRepo.save({
      id: TARGET_USER_ID,
      email: 'privacy-target@tenant1.local',
      passwordHash: 'hash',
      role: Role.FIELD_STAFF,
      isActive: true,
      emailVerified: true,
      isMfaEnabled: false,
      tenantId: TENANT_1_ID,
    });

    await profileRepo.save({
      userId: TARGET_USER_ID,
      firstName: 'TenantOne',
      lastName: 'User',
      phone: '+1000000001',
      address: 'Tenant One Street',
      tenantId: TENANT_1_ID,
    });

    await clientRepo.save([
      {
        id: TENANT_1_CLIENT_ID,
        name: 'Tenant 1 Client',
        email: 'client1@tenant.local',
        phone: '+1000000002',
        tenantId: TENANT_1_ID,
      },
      {
        id: TENANT_2_CLIENT_ID,
        name: 'Tenant 2 Client',
        email: 'client2@tenant.local',
        phone: '+1000000003',
        tenantId: TENANT_2_ID,
      },
    ]);

    await packageRepo.save([
      {
        id: TENANT_1_PACKAGE_ID,
        name: 'Tenant 1 Package',
        description: 'Tenant1 package',
        price: 1000,
        durationMinutes: 60,
        requiredStaffCount: 1,
        tenantId: TENANT_1_ID,
      },
      {
        id: TENANT_2_PACKAGE_ID,
        name: 'Tenant 2 Package',
        description: 'Tenant2 package',
        price: 1200,
        durationMinutes: 60,
        requiredStaffCount: 1,
        tenantId: TENANT_2_ID,
      },
    ]);

    await bookingRepo.save([
      {
        id: TENANT_1_BOOKING_ID,
        clientId: TENANT_1_CLIENT_ID,
        packageId: TENANT_1_PACKAGE_ID,
        eventDate: new Date('2030-01-10T10:00:00.000Z'),
        status: BookingStatus.CONFIRMED,
        totalPrice: 1000,
        subTotal: 1000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        tenantId: TENANT_1_ID,
      },
      {
        id: TENANT_2_BOOKING_ID,
        clientId: TENANT_2_CLIENT_ID,
        packageId: TENANT_2_PACKAGE_ID,
        eventDate: new Date('2030-01-10T10:00:00.000Z'),
        status: BookingStatus.CONFIRMED,
        totalPrice: 1200,
        subTotal: 1200,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        tenantId: TENANT_2_ID,
      },
    ]);

    await taskTypeRepo.save([
      {
        id: TENANT_1_TASK_TYPE_ID,
        name: 'Tenant1 TaskType',
        description: 'Tenant1 task type',
        defaultCommissionAmount: 0,
        tenantId: TENANT_1_ID,
      },
      {
        id: TENANT_2_TASK_TYPE_ID,
        name: 'Tenant2 TaskType',
        description: 'Tenant2 task type',
        defaultCommissionAmount: 0,
        tenantId: TENANT_2_ID,
      },
    ]);

    await taskRepo.save({
      id: TENANT_1_TASK_ID,
      bookingId: TENANT_1_BOOKING_ID,
      taskTypeId: TENANT_1_TASK_TYPE_ID,
      assignedUserId: TARGET_USER_ID,
      status: TaskStatus.PENDING,
      commissionSnapshot: 125,
      tenantId: TENANT_1_ID,
    });

    await dataSource.query("SET session_replication_role = 'replica'");
    try {
      await dataSource.query(
        'INSERT INTO "tasks" ("id", "booking_id", "task_type_id", "assigned_user_id", "status", "commission_snapshot", "tenant_id") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          LEAK_TRAP_TASK_ID,
          TENANT_2_BOOKING_ID,
          TENANT_2_TASK_TYPE_ID,
          TARGET_USER_ID,
          TaskStatus.PENDING,
          75,
          TENANT_2_ID,
        ],
      );
    } finally {
      await dataSource.query("SET session_replication_role = 'origin'");
    }

    await transactionRepo.save([
      {
        id: TENANT_1_TRANSACTION_ID,
        type: TransactionType.INCOME,
        amount: 500,
        category: 'TENANT1_EXPORT_MARKER',
        bookingId: null,
        taskId: TENANT_1_TASK_ID,
        payoutId: null,
        description: 'Tenant1 transaction for privacy export',
        transactionDate: new Date('2030-01-10T12:00:00.000Z'),
        tenantId: TENANT_1_ID,
      },
      {
        id: LEAK_TRAP_TRANSACTION_ID,
        type: TransactionType.INCOME,
        amount: 900,
        category: 'TENANT2_LEAK_TRAP_MARKER',
        bookingId: null,
        taskId: LEAK_TRAP_TASK_ID,
        payoutId: null,
        description: 'Tenant2 leak trap transaction',
        transactionDate: new Date('2030-01-10T12:30:00.000Z'),
        tenantId: TENANT_2_ID,
      },
    ]);

    await privacyRequestRepo.save({
      id: PRIVACY_REQUEST_ID,
      userId: TARGET_USER_ID,
      tenantId: TENANT_1_ID,
      type: PrivacyRequestType.DATA_EXPORT,
      status: PrivacyRequestStatus.PENDING,
      requestedAt: new Date('2030-01-10T13:00:00.000Z'),
    });

    let capturedExportData: CapturedExportData | undefined;
    jest
      .spyOn(
        privacyService as unknown as {
          createExportZip: (userId: string, data: CapturedExportData) => Promise<{ filePath: string; key: string }>;
        },
        'createExportZip',
      )
      .mockImplementation(async (_userId: string, data: CapturedExportData) => {
        capturedExportData = data;
        return {
          filePath: '/tmp/privacy-export-fixed.zip',
          key: 'privacy-exports/privacy-export-fixed.zip',
        };
      });

    await TenantContextService.run(TENANT_1_ID, () => privacyService.processDataExport(PRIVACY_REQUEST_ID));

    expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledTimes(1);
    expect(capturedExportData).toBeDefined();

    const exportedTaskIds = capturedExportData?.tasks.map((task) => task.id) ?? [];
    const exportedBookingIds = capturedExportData?.bookings.map((booking) => booking.id) ?? [];
    const exportedTransactionIds = capturedExportData?.transactions.map((transaction) => transaction.id) ?? [];

    expect(capturedExportData?.user.id).toBe(TARGET_USER_ID);
    expect(capturedExportData?.profile?.firstName).toBe('TenantOne');

    expect(exportedTaskIds).toContain(TENANT_1_TASK_ID);
    expect(exportedTaskIds).not.toContain(LEAK_TRAP_TASK_ID);

    expect(exportedBookingIds).toContain(TENANT_1_BOOKING_ID);
    expect(exportedBookingIds).not.toContain(TENANT_2_BOOKING_ID);

    expect(exportedTransactionIds).toContain(TENANT_1_TRANSACTION_ID);
    expect(exportedTransactionIds).not.toContain(LEAK_TRAP_TRANSACTION_ID);

    const updatedRequest = await privacyRequestRepo.findOneByOrFail({ id: PRIVACY_REQUEST_ID });
    expect(updatedRequest.status).toBe(PrivacyRequestStatus.COMPLETED);
    expect(updatedRequest.downloadUrl).toBe('https://example.local/privacy-export.zip');
  });
});
