import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import {
  BookingStatus,
  TaskStatus,
  TransactionType,
} from '../../../common/enums';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { FinanceService } from '../../finance/services/finance.service';
import { Task } from '../../tasks/entities/task.entity';
import { ConfirmBookingResponseDto } from '../dto';
import { Booking } from '../entities/booking.entity';
import { BookingConfirmedEvent } from '../events/booking-confirmed.event';

@Injectable()
export class BookingWorkflowService {
  private readonly logger = new Logger(BookingWorkflowService.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * WORKFLOW 1: Booking Confirmation
   * Transactional steps:
   * 1. Acquire pessimistic lock on booking
   * 2. Update booking status to CONFIRMED
   * 3. Generate Tasks from ServicePackage items (bulk insert)
   * 4. Create INCOME transaction in Finance
   * 5. Rollback all on failure
   */
  async confirmBooking(id: string): Promise<ConfirmBookingResponseDto> {
    const tenantId = TenantContextService.getTenantId();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Acquire pessimistic lock to prevent race conditions
      const bookingLock = await queryRunner.manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bookingLock) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      // Step 2: Fetch actual data with relations.
      const booking = await queryRunner.manager.findOne(Booking, {
        where: { id, tenantId },
        relations: [
          'client',
          'servicePackage',
          'servicePackage.packageItems',
          'servicePackage.packageItems.taskType',
        ],
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      if (booking.status !== BookingStatus.DRAFT) {
        throw new BadRequestException(
          `Booking is already ${booking.status}. Only DRAFT bookings can be confirmed.`,
        );
      }

      // Step 2: Update booking status to CONFIRMED
      booking.status = BookingStatus.CONFIRMED;
      await queryRunner.manager.save(booking);

      // Step 3: Generate Tasks from package items (bulk insert for performance)
      const packageItems = await (booking.servicePackage?.packageItems ??
        Promise.resolve([]));
      const tasksToCreate: Partial<Task>[] = [];
      const maxTasks = this.configService.get<number>(
        'booking.maxTasksPerBooking',
        500,
      );

      // Calculate total tasks to be created
      const totalTasksCount = packageItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0,
      );

      if (totalTasksCount > maxTasks) {
        throw new BadRequestException(
          `Cannot confirm booking: total tasks requested (${totalTasksCount}) exceeds the maximum allowed limit of ${maxTasks} per booking.`,
        );
      }

      for (const item of packageItems) {
        for (let i = 0; i < item.quantity; i++) {
          tasksToCreate.push({
            bookingId: booking.id,
            taskTypeId: item.taskTypeId,
            status: TaskStatus.PENDING,
            commissionSnapshot:
              (item as { taskType?: { defaultCommissionAmount?: number } })
                .taskType?.defaultCommissionAmount ?? 0,
            dueDate: booking.eventDate,
            tenantId: booking.tenantId,
          });
        }
      }

      const createdTasks = await queryRunner.manager.save(Task, tasksToCreate);

      // Step 3: Create INCOME transaction
      const transaction =
        await this.financeService.createTransactionWithManager(
          queryRunner.manager,
          {
            type: TransactionType.INCOME,
            amount: Number(booking.totalPrice),
            category: 'Booking Payment',
            bookingId: booking.id,
            description: `Booking confirmed: ${booking.client?.name || 'Unknown Client'} - ${booking.servicePackage?.name}`,
            transactionDate: new Date(),
          },
        );

      // Step 4: Audit Log
      await this.auditService.log(
        {
          action: 'STATUS_CHANGE',
          entityName: 'Booking',
          entityId: booking.id,
          oldValues: { status: BookingStatus.DRAFT },
          newValues: { status: BookingStatus.CONFIRMED },
          notes: 'Booking confirmed, tasks generated and payment recorded.',
        },
        queryRunner.manager,
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      // Emit domain event for side effects (webhooks, emails, etc.)
      this.eventBus.publish(
        new BookingConfirmedEvent(
          booking.id,
          booking.tenantId,
          booking.client?.email || '',
          booking.client?.name || 'Client',
          booking.servicePackage?.name || 'Service Package',
          Number(booking.totalPrice),
          booking.eventDate,
        ),
      );

      return {
        booking,
        tasksCreated: createdTasks.length,
        transactionId: transaction.id,
      };
    } catch (error) {
      // Rollback on failure
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
