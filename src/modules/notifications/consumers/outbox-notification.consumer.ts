import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsumerInboxService } from '../../../common/services/consumer-inbox.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import {
  DURABLE_NOTIFICATION_EVENTS_FLAG,
  isNotificationOutboxEventType,
  type OutboxEventEnvelope,
} from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { Role } from '../../users/domain/enums/role.enum';
import { UsersService } from '../../users/application/users.service';
import { NotificationType } from '../domain/enums/notification.enum';
import { NotificationService } from '../application/notification.service';

const CONSUMER_NAME = 'outbox-notification-consumer';

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

@Injectable()
export class OutboxNotificationConsumer {
  private readonly logger = new Logger(OutboxNotificationConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly consumerInbox: ConsumerInboxService,
    private readonly notificationService: NotificationService,
    private readonly usersService: UsersService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async process(envelope: OutboxEventEnvelope): Promise<void> {
    if (!isNotificationOutboxEventType(envelope.eventType)) {
      return;
    }

    if (!(this.flagsService?.isEnabled(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true) ?? true)) {
      this.logger.debug(`Durable notification kill switch off — skipping ${envelope.eventId}`);
      return;
    }

    const tenantId = envelope.tenantId;
    if (!tenantId) {
      throw new Error(`Notification outbox event ${envelope.eventId} missing tenantId`);
    }

    await TenantContextService.run(tenantId, async () =>
      this.dataSource.transaction(async (manager) => {
        const claimed = await this.consumerInbox.tryClaim(CONSUMER_NAME, envelope.eventId, manager);
        if (!claimed) {
          this.logger.debug(`Duplicate notification outbox event ${envelope.eventId} — skipping`);
          return;
        }

        await this.dispatchNotification(envelope);

        await this.consumerInbox.recordProcessed(CONSUMER_NAME, envelope.eventId, manager);
      }),
    );
  }

  private async dispatchNotification(envelope: OutboxEventEnvelope): Promise<void> {
    switch (envelope.eventType) {
      case 'BookingCreatedEvent':
        await this.handleBookingCreated(envelope);
        return;
      case 'BookingCompletedEvent':
        await this.handleBookingCompleted(envelope);
        return;
      case 'TaskAssignedEvent':
        await this.handleTaskAssigned(envelope);
        return;
      case 'TaskCompletedEvent':
        await this.handleTaskCompleted(envelope);
        return;
      default:
        this.logger.warn(`No notification mapping for ${envelope.eventType}`);
    }
  }

  private async handleBookingCompleted(envelope: OutboxEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    const bookingId = asString(payload.bookingId, envelope.aggregateId);
    const completedAt = asDate(payload.completedAt);
    const tenantId = envelope.tenantId!;

    const notifiableUsers = await this.usersService.findByRoles([Role.ADMIN, Role.OPS_MANAGER]);

    for (const user of notifiableUsers) {
      await this.notificationService.createNotification({
        userId: user.id,
        tenantId,
        type: NotificationType.BOOKING_COMPLETED,
        title: 'Booking Completed',
        message: `Booking ${bookingId} was marked completed.`,
        metadata: {
          bookingId,
          completedAt: completedAt.toISOString(),
        },
      });
    }

    this.logger.log(
      `Outbox notifications created for completed booking ${bookingId} (${notifiableUsers.length} users)`,
    );
  }

  private async handleBookingCreated(envelope: OutboxEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    const bookingId = asString(payload.bookingId, envelope.aggregateId);
    const clientName = asString(payload.clientName, 'Client');
    const packageName = asString(payload.packageName, 'Service Package');
    const totalPrice = asNumber(payload.totalPrice);
    const eventDate = asDate(payload.eventDate);
    const tenantId = envelope.tenantId!;

    const notifiableUsers = await this.usersService.findByRoles([Role.ADMIN, Role.OPS_MANAGER]);

    for (const user of notifiableUsers) {
      await this.notificationService.createNotification({
        userId: user.id,
        tenantId,
        type: NotificationType.BOOKING_CREATED,
        title: 'New Booking Created',
        message: `A new booking has been created for ${clientName} (${packageName}). Event date: ${eventDate.toLocaleDateString()}`,
        metadata: {
          bookingId,
          clientEmail: payload.clientEmail,
          totalPrice,
          eventDate: eventDate.toISOString(),
        },
      });
    }

    this.logger.log(`Outbox notifications created for booking ${bookingId} (${notifiableUsers.length} users)`);
  }

  private async handleTaskAssigned(envelope: OutboxEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    const tenantId = envelope.tenantId!;
    const taskId = asString(payload.taskId, envelope.aggregateId);
    const employeeEmail = asString(payload.employeeEmail);
    const employeeName = asString(payload.employeeName, employeeEmail || 'Employee');
    const processingTypeName = asString(payload.processingTypeName ?? payload.processingType, 'Task');
    const clientName = asString(payload.clientName, 'Client');
    const eventDate = asDate(payload.eventDate);
    const commission = asNumber(payload.commission);

    const user = employeeEmail ? await this.usersService.findByEmail(employeeEmail, tenantId) : null;
    if (!user) {
      this.logger.warn(`No notification recipient found for TaskAssignedEvent ${envelope.eventId}`);
      return;
    }

    await this.notificationService.createNotification({
      userId: user.id,
      tenantId,
      type: NotificationType.TASK_ASSIGNED,
      title: 'Task Assigned',
      message: `You have been assigned ${processingTypeName} for ${clientName}. Event date: ${eventDate.toLocaleDateString()}`,
      metadata: {
        taskId,
        employeeEmail,
        employeeName,
        processingTypeName,
        clientName,
        eventDate: eventDate.toISOString(),
        commission,
      },
    });

    this.logger.log(`Outbox notification created for task assignment ${taskId} (${user.id})`);
  }

  private async handleTaskCompleted(envelope: OutboxEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    const tenantId = envelope.tenantId!;
    const taskId = asString(payload.taskId, envelope.aggregateId);
    const assignedUserId = asString(payload.assignedUserId);
    const completedAt = asDate(payload.completedAt);
    const commissionAccrued = asNumber(payload.commissionAccrued);

    if (!assignedUserId) {
      this.logger.warn(`No notification recipient found for TaskCompletedEvent ${envelope.eventId}`);
      return;
    }

    await this.notificationService.createNotification({
      userId: assignedUserId,
      tenantId,
      type: NotificationType.TASK_COMPLETED,
      title: 'Task Completed',
      message: `Task completed. Commission accrued: ${commissionAccrued}.`,
      metadata: {
        taskId,
        assignedUserId,
        completedAt: completedAt.toISOString(),
        commissionAccrued,
      },
    });

    this.logger.log(`Outbox notification created for completed task ${taskId} (${assignedUserId})`);
  }
}
