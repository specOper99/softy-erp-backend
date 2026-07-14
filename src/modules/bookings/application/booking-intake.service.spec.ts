import { BadRequestException } from '@nestjs/common';
import { mockTenantContext } from '../../../../test/helpers/mock-factories';
import type { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import type { BookingIntakeDto } from '../api/dto/booking-intake.dto';
import { BookingIntakeService } from './booking-intake.service';

describe('BookingIntakeService', () => {
  const tenantId = 'tenant-123';
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  const dataSource = {
    transaction: jest.fn(),
  };
  const bookingRepository = {};
  const clientRepository = {};
  const catalogService = {
    findPackageById: jest.fn(),
  };
  const financeService = {
    createTransactionWithManager: jest.fn(),
    notifyTransactionCreated: jest.fn(),
  };
  const staffConflictService = {
    checkPackageStaffAvailability: jest.fn(),
  };
  const eventBus = {
    publish: jest.fn(),
  };
  const processingTypeRepository = {
    find: jest.fn(),
  };
  const availabilityCacheOwner = {
    delAvailability: jest.fn(),
  };

  let service: BookingIntakeService;
  let transactionManager!: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantContext(tenantId);
    catalogService.findPackageById.mockResolvedValue({
      id: 'pkg-1',
      tenantId,
      name: 'Wedding',
      price: 100,
      durationMinutes: 60,
    });
    staffConflictService.checkPackageStaffAvailability.mockResolvedValue({
      ok: true,
      requiredStaffCount: 1,
      eligibleCount: 1,
      busyCount: 0,
      availableCount: 1,
    });
    processingTypeRepository.find.mockResolvedValue([]);
    dataSource.transaction.mockImplementation(
      async (callback: (manager: Record<string, jest.Mock>) => Promise<void>) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'client-1',
            tenantId,
            name: 'Client One',
            email: 'client@example.test',
            tags: [],
            createdAt: new Date(),
          }),
          create: jest.fn((_entity, value) => value),
          save: jest.fn((_entity, value) =>
            Promise.resolve({
              id: value.id ?? 'booking-1',
              createdAt: new Date(),
              ...value,
            }),
          ),
          update: jest.fn(),
        };
        transactionManager = manager;
        await callback(manager);
      },
    );

    service = new BookingIntakeService(
      dataSource as never,
      bookingRepository as never,
      clientRepository as never,
      catalogService as never,
      financeService as never,
      staffConflictService as never,
      eventBus as never,
      processingTypeRepository as never,
      availabilityCacheOwner as unknown as AvailabilityCacheOwnerService,
    );
  });

  it('rejects processing types that do not belong to the selected package', async () => {
    const dto: BookingIntakeDto = {
      client: { clientId: 'client-1' },
      packageId: 'pkg-1',
      eventDate: futureDate,
      startTime: '10:00',
      processingTypeIds: ['pt-2'],
    };
    processingTypeRepository.find.mockResolvedValue([
      { id: 'pt-2', tenantId, packageId: 'pkg-2', name: 'Wrong Package', price: 25 },
    ]);

    await expect(service.intake(dto)).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('writes booking-created outbox row inside intake transaction', async () => {
    const dto: BookingIntakeDto = {
      client: { clientId: 'client-1' },
      packageId: 'pkg-1',
      eventDate: futureDate,
      startTime: '10:00',
    };

    await service.intake(dto);

    expect(transactionManager.save).toHaveBeenCalledWith(
      OutboxEvent,
      expect.objectContaining({
        aggregateId: 'booking-1',
        aggregateType: 'Booking',
        type: 'BookingCreatedEvent',
        tenantId,
        payload: expect.objectContaining({
          bookingId: 'booking-1',
          tenantId,
          clientId: 'client-1',
          packageId: 'pkg-1',
          packageName: 'Wedding',
          totalPrice: 100,
        }),
      }),
    );
  });
});
