import { Test, TestingModule } from '@nestjs/testing';
import { createMockRepository, MockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { PackageItem } from '../../catalog/entities/package-item.entity';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { PackageItemRepository } from '../../catalog/repositories/package-item.repository';
import { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import { TaskTypeEligibility } from '../../hr/entities/task-type-eligibility.entity';
import { TaskTypeEligibilityRepository } from '../../hr/repositories/task-type-eligibility.repository';
import { TaskAssignee } from '../../tasks/entities/task-assignee.entity';
import { Task } from '../../tasks/entities/task.entity';
import { TaskAssigneeRepository } from '../../tasks/repositories/task-assignee.repository';
import { TaskRepository } from '../../tasks/repositories/task.repository';
import { User } from '../../users/entities/user.entity';
import { UserRepository } from '../../users/repositories/user.repository';
import { StaffConflictService } from './staff-conflict.service';

type BusyAssignmentRecord = {
  userId: string;
  eventDate: Date | string;
  startTime: string;
  durationMinutes: number | string;
};

const createRawQueryBuilder = (rows: BusyAssignmentRecord[]) => {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
};

describe('StaffConflictService', () => {
  let service: StaffConflictService;
  let servicePackageRepo: MockRepository<ServicePackage>;
  let packageItemRepo: MockRepository<PackageItem>;
  let taskTypeEligibilityRepo: MockRepository<TaskTypeEligibility>;
  let userRepo: MockRepository<User>;
  let taskAssigneeRepo: MockRepository<TaskAssignee>;
  let taskRepo: MockRepository<Task>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffConflictService,
        {
          provide: ServicePackageRepository,
          useValue: createMockRepository<ServicePackage>(),
        },
        {
          provide: PackageItemRepository,
          useValue: createMockRepository<PackageItem>(),
        },
        {
          provide: TaskTypeEligibilityRepository,
          useValue: createMockRepository<TaskTypeEligibility>(),
        },
        {
          provide: UserRepository,
          useValue: createMockRepository<User>(),
        },
        {
          provide: TaskAssigneeRepository,
          useValue: createMockRepository<TaskAssignee>(),
        },
        {
          provide: TaskRepository,
          useValue: createMockRepository<Task>(),
        },
      ],
    }).compile();

    service = module.get<StaffConflictService>(StaffConflictService);
    servicePackageRepo = module.get(ServicePackageRepository);
    packageItemRepo = module.get(PackageItemRepository);
    taskTypeEligibilityRepo = module.get(TaskTypeEligibilityRepository);
    userRepo = module.get(UserRepository);
    taskAssigneeRepo = module.get(TaskAssigneeRepository);
    taskRepo = module.get(TaskRepository);

    mockTenantContext('tenant-123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ok=true when available staff meets required staff count', async () => {
    servicePackageRepo.findOne.mockResolvedValue({
      id: 'pkg-1',
      tenantId: 'tenant-123',
      durationMinutes: 120,
      requiredStaffCount: 2,
    } as ServicePackage);
    packageItemRepo.find.mockResolvedValue([
      { taskTypeId: 'tt-1' } as PackageItem,
      { taskTypeId: 'tt-2' } as PackageItem,
      { taskTypeId: 'tt-1' } as PackageItem,
    ]);
    taskTypeEligibilityRepo.find.mockResolvedValue([
      { userId: 'u-1' } as TaskTypeEligibility,
      { userId: 'u-2' } as TaskTypeEligibility,
      { userId: 'u-3' } as TaskTypeEligibility,
      { userId: 'u-3' } as TaskTypeEligibility,
    ]);
    userRepo.find.mockResolvedValue([{ id: 'u-1' } as User, { id: 'u-2' } as User, { id: 'u-3' } as User]);

    const assigneeQb = createRawQueryBuilder([
      {
        userId: 'u-1',
        eventDate: new Date('2026-05-01T00:00:00.000Z'),
        startTime: '10:30',
        durationMinutes: 60,
      },
    ]);
    const legacyQb = createRawQueryBuilder([]);
    taskAssigneeRepo.createQueryBuilder.mockReturnValue(assigneeQb);
    taskRepo.createQueryBuilder.mockReturnValue(legacyQb);

    const result = await service.checkPackageStaffAvailability({
      packageId: 'pkg-1',
      eventDate: new Date('2026-05-01T00:00:00.000Z'),
      startTime: '10:00',
    });

    expect(result).toEqual({
      ok: true,
      requiredStaffCount: 2,
      eligibleCount: 3,
      busyCount: 1,
      availableCount: 2,
    });
  });

  it('returns ok=false with early exit when eligible staff is below required', async () => {
    servicePackageRepo.findOne.mockResolvedValue({
      id: 'pkg-2',
      tenantId: 'tenant-123',
      durationMinutes: 90,
      requiredStaffCount: 3,
    } as ServicePackage);
    packageItemRepo.find.mockResolvedValue([{ taskTypeId: 'tt-1' } as PackageItem]);
    taskTypeEligibilityRepo.find.mockResolvedValue([
      { userId: 'u-1' } as TaskTypeEligibility,
      { userId: 'u-2' } as TaskTypeEligibility,
    ]);
    userRepo.find.mockResolvedValue([{ id: 'u-1' } as User, { id: 'u-2' } as User]);

    const result = await service.checkPackageStaffAvailability({
      packageId: 'pkg-2',
      eventDate: new Date('2026-05-01T00:00:00.000Z'),
      startTime: '14:00',
    });

    expect(result).toEqual({
      ok: false,
      requiredStaffCount: 3,
      eligibleCount: 2,
      busyCount: 0,
      availableCount: 2,
    });
    expect(taskAssigneeRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(taskRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not mark user busy when existing booking touches boundary only', async () => {
    servicePackageRepo.findOne.mockResolvedValue({
      id: 'pkg-3',
      tenantId: 'tenant-123',
      durationMinutes: 60,
      requiredStaffCount: 1,
    } as ServicePackage);
    packageItemRepo.find.mockResolvedValue([{ taskTypeId: 'tt-9' } as PackageItem]);
    taskTypeEligibilityRepo.find.mockResolvedValue([{ userId: 'u-9' } as TaskTypeEligibility]);
    userRepo.find.mockResolvedValue([{ id: 'u-9' } as User]);

    const assigneeQb = createRawQueryBuilder([
      {
        userId: 'u-9',
        eventDate: new Date('2026-05-01T00:00:00.000Z'),
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);
    const legacyQb = createRawQueryBuilder([]);
    taskAssigneeRepo.createQueryBuilder.mockReturnValue(assigneeQb);
    taskRepo.createQueryBuilder.mockReturnValue(legacyQb);

    const result = await service.checkPackageStaffAvailability({
      packageId: 'pkg-3',
      eventDate: new Date('2026-05-01T00:00:00.000Z'),
      startTime: '11:00',
    });

    expect(result).toEqual({
      ok: true,
      requiredStaffCount: 1,
      eligibleCount: 1,
      busyCount: 0,
      availableCount: 1,
    });
  });
});
