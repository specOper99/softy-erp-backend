import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MathUtils } from '../../../common/utils/math.utils';
import { Task } from '../../tasks/entities/task.entity';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { Booking } from '../entities/booking.entity';

/**
 * Handles TaskCompletedEvent to recalculate and update
 * the booking's completionPercentage (Gap 6).
 */
@EventsHandler(TaskCompletedEvent)
export class BookingCompletionHandler implements IEventHandler<TaskCompletedEvent> {
  private readonly logger = new Logger(BookingCompletionHandler.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async handle(event: TaskCompletedEvent): Promise<void> {
    try {
      // Find the task to get the bookingId
      const task = await this.dataSource.manager.findOne(Task, {
        where: { id: event.taskId },
        select: ['id', 'bookingId', 'tenantId'],
      });

      if (!task?.bookingId) {
        return; // Task is not linked to a booking
      }

      // Count all tasks and completed tasks for this booking
      const allTasks = await this.dataSource.manager.find(Task, {
        where: { bookingId: task.bookingId, tenantId: task.tenantId },
        select: ['id', 'status'],
      });

      const totalCount = allTasks.length;
      if (totalCount === 0) {
        return;
      }

      const completedCount = allTasks.filter((t: Task) => t.status === TaskStatus.COMPLETED).length;
      const percentage = MathUtils.round((completedCount / totalCount) * 100);

      await this.dataSource.manager.update(
        Booking,
        { id: task.bookingId, tenantId: task.tenantId },
        { completionPercentage: percentage },
      );

      this.logger.log(`Booking ${task.bookingId} completion updated: ${completedCount}/${totalCount} (${percentage}%)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update booking completion: ${message}`);
    }
  }
}
