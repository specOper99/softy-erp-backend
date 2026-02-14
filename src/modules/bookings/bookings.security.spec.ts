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
import { CacheUtilsService } from '../../common/cache/cache-utils.service';
import { Task } from '../tasks/entities/task.entity';

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
        { provide: CacheUtilsService, useValue: { del: jest.fn(), invalidateByPattern: jest.fn() } },
        { provide: DataSource, useValue: {} },
        { provide: EventBus, useValue: {} },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should allow FIELD_STAFF to see all bookings (current insecurity)', async () => {
    const fieldStaffUser = {
      id: 'user-123',
      role: Role.FIELD_STAFF,
    } as User;

    await service.findAll(new BookingFilterDto(), fieldStaffUser);

    // Current behavior: YES filtering by assigned tasks
    expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith(
      Task,
      'task',
      'task.bookingId = booking.id AND task.tenantId = booking.tenantId',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.assignedUserId = :userId', {
      userId: fieldStaffUser.id,
    });
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
