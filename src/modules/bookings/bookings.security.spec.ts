import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { mockTenantContext } from '../../../test/helpers/mock-factories';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/services/catalog.service';
import { FinanceService } from '../finance/services/finance.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { BookingFilterDto } from './dto';
import { BookingRepository } from './repositories/booking.repository';
import { BookingStateMachineService } from './services/booking-state-machine.service';
import { BookingsService } from './services/bookings.service';
import { AvailabilityCacheOwnerService } from '../../common/cache/availability-cache-owner.service';
import { CacheUtilsService } from '../../common/cache/cache-utils.service';
import { Task } from '../tasks/entities/task.entity';
import { StaffConflictService } from './services/staff-conflict.service';

describe('Bookings Security Test', () => {
  let service: BookingsService;
  let mockQueryBuilder: Partial<SelectQueryBuilder<any>>;

  beforeEach(async () => {
    mockTenantContext('test-tenant-123');
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: BookingRepository,
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        { provide: CatalogService, useValue: {} },
        { provide: FinanceService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: BookingStateMachineService, useValue: {} },
        { provide: StaffConflictService, useValue: { checkPackageStaffAvailability: jest.fn() } },
        { provide: CacheUtilsService, useValue: { del: jest.fn(), invalidateByPattern: jest.fn() } },
        { provide: AvailabilityCacheOwnerService, useValue: { delAvailability: jest.fn() } },
        { provide: DataSource, useValue: {} },
        { provide: EventBus, useValue: {} },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should filter FIELD_STAFF to only see bookings assigned via tasks', async () => {
    const fieldStaffUser = {
      id: 'user-123',
      role: Role.FIELD_STAFF,
    } as User;

    await service.findAll(new BookingFilterDto(), fieldStaffUser);

    // Verify leftJoinAndSelect is used for tasks
    expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(Task, 'tasks', expect.any(String));

    // Verify EXISTS predicate uses both task_assignees join table and legacy assigned_user_id
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), {
      userId: fieldStaffUser.id,
    });

    // Verify the predicate includes task_assignees reference
    const andWhereCall = (mockQueryBuilder.andWhere as jest.Mock).mock.calls[0];
    expect(andWhereCall[0]).toMatch(/task_assignees/i);
    expect(andWhereCall[0]).toMatch(/assigned_user_id/i);
    expect(andWhereCall[1]).toEqual({ userId: fieldStaffUser.id });
  });

  it('should NOT filter for ADMIN users', async () => {
    const adminUser = {
      id: 'admin-123',
      role: Role.ADMIN,
    } as User;

    await service.findAll(new BookingFilterDto(), adminUser);

    expect(mockQueryBuilder.innerJoin).not.toHaveBeenCalledWith(
      Task,
      'task',
      'task.bookingId = booking.id AND task.tenantId = booking.tenantId',
    );
  });
});
