import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { mockTenantContext } from '../../../test/helpers/mock-factories';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/services/catalog.service';
import { DashboardGateway } from '../dashboard/dashboard.gateway';
import { FinanceService } from '../finance/services/finance.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { BookingFilterDto } from './dto';
import { BookingRepository } from './repositories/booking.repository';
import { BookingStateMachineService } from './services/booking-state-machine.service';
import { BookingsService } from './services/bookings.service';

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
        { provide: DashboardGateway, useValue: {} },
        { provide: BookingStateMachineService, useValue: {} },
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

    // We pass the user just to simulate the future state, but current findAll doesn't accept it
    // @ts-expect-error testing future state with user parameter not yet implemented
    await service.findAll(new BookingFilterDto(), fieldStaffUser);

    // Current behavior: YES filtering by assigned tasks
    expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith('booking.tasks', 'task');
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

    expect(mockQueryBuilder.innerJoin).not.toHaveBeenCalledWith('booking.tasks', 'task');
  });
});
