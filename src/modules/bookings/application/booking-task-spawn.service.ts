import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { Task } from '../../tasks/domain/entities/task.entity';
import { TaskStatus } from '../../tasks/domain/enums/task-status.enum';
import { Booking } from '../domain/entities/booking.entity';
import { ProcessingType } from '../domain/entities/processing-type.entity';

/**
 * Spawns PENDING tasks from booking processing types on confirm.
 */
@Injectable()
export class BookingTaskSpawnService {
  constructor(private readonly configService: ConfigService) {}

  async spawnTasksForConfirm(manager: EntityManager, booking: Booking, tenantId: string): Promise<Task[]> {
    const bookingWithPT = await manager.findOne(Booking, {
      where: { id: booking.id, tenantId },
      relations: ['processingTypes'],
    });
    const processingTypes: ProcessingType[] = bookingWithPT?.processingTypes ?? [];
    const tasksToCreate: Partial<Task>[] = [];
    const maxTasks = this.configService.get<number>('booking.maxTasksPerBooking', 500);

    if (processingTypes.length > maxTasks) {
      throw new BadRequestException(
        `Cannot confirm booking: total tasks requested(${processingTypes.length}) exceeds the maximum allowed limit of ${maxTasks} per booking.`,
      );
    }

    for (const pt of processingTypes) {
      tasksToCreate.push({
        bookingId: booking.id,
        processingTypeId: pt.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: Number(pt.defaultCommissionAmount) || 0,
        dueDate: booking.eventDate,
        tenantId: booking.tenantId,
        locationLink: booking.locationLink ?? null,
      });
    }

    return manager.save(Task, tasksToCreate);
  }
}
