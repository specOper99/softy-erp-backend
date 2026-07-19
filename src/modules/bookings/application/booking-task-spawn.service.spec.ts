import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { TaskStatus } from '../../tasks/domain/enums/task-status.enum';
import { Booking } from '../domain/entities/booking.entity';
import { BookingTaskSpawnService } from './booking-task-spawn.service';

describe('BookingTaskSpawnService', () => {
  let service: BookingTaskSpawnService;
  let configService: { get: jest.Mock };
  let manager: { findOne: jest.Mock; save: jest.Mock };

  const booking = {
    id: 'booking-1',
    tenantId: 'tenant-1',
    eventDate: new Date('2026-08-01T10:00:00.000Z'),
    locationLink: 'https://maps.example/studio',
  } as Booking;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((_key: string, fallback?: number) => fallback ?? 500),
    };
    manager = {
      findOne: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((_entity, rows) =>
          Promise.resolve(rows.map((row: Record<string, unknown>, i: number) => ({ id: `task-${i + 1}`, ...row }))),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BookingTaskSpawnService, { provide: ConfigService, useValue: configService }],
    }).compile();

    service = module.get(BookingTaskSpawnService);
  });

  it('spawns PENDING tasks from booking processing types on confirm', async () => {
    manager.findOne.mockResolvedValue({
      ...booking,
      processingTypes: [
        { id: 'pt-1', defaultCommissionAmount: 25 },
        { id: 'pt-2', defaultCommissionAmount: '10.5' },
      ],
    });

    const tasks = await service.spawnTasksForConfirm(manager as unknown as EntityManager, booking, 'tenant-1');

    expect(manager.findOne).toHaveBeenCalledWith(
      Booking,
      expect.objectContaining({
        where: { id: booking.id, tenantId: 'tenant-1' },
        relations: ['processingTypes'],
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: booking.id,
          processingTypeId: 'pt-1',
          status: TaskStatus.PENDING,
          commissionSnapshot: 25,
          tenantId: 'tenant-1',
          locationLink: booking.locationLink,
        }),
        expect.objectContaining({
          processingTypeId: 'pt-2',
          status: TaskStatus.PENDING,
          commissionSnapshot: 10.5,
        }),
      ]),
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.status === TaskStatus.PENDING)).toBe(true);
  });

  it('returns empty array when booking has no processing types', async () => {
    manager.findOne.mockResolvedValue({ ...booking, processingTypes: [] });

    const tasks = await service.spawnTasksForConfirm(manager as unknown as EntityManager, booking, 'tenant-1');

    expect(manager.save).toHaveBeenCalledWith(expect.anything(), []);
    expect(tasks).toEqual([]);
  });

  it('rejects when processing types exceed maxTasksPerBooking', async () => {
    configService.get.mockReturnValue(2);
    manager.findOne.mockResolvedValue({
      ...booking,
      processingTypes: [{ id: 'pt-1' }, { id: 'pt-2' }, { id: 'pt-3' }],
    });

    await expect(
      service.spawnTasksForConfirm(manager as unknown as EntityManager, booking, 'tenant-1'),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
