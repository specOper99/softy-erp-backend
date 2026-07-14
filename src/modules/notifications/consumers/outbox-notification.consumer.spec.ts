import { OutboxNotificationConsumer } from './outbox-notification.consumer';
import type { OutboxEventEnvelope } from '../../../common/events/outbox-envelope';
import { DURABLE_NOTIFICATION_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { NotificationType } from '../domain/enums/notification.enum';

describe('OutboxNotificationConsumer', () => {
  const envelope: OutboxEventEnvelope = {
    eventId: 'evt-notification-1',
    eventType: 'BookingCreatedEvent',
    eventVersion: 1,
    tenantId: 'tenant-1',
    aggregateType: 'booking',
    aggregateId: 'booking-1',
    occurredAt: '2030-01-01T10:00:00.000Z',
    payload: {
      bookingId: 'booking-1',
      clientName: 'Ada',
      clientEmail: 'ada@example.com',
      eventDate: '2030-06-15T00:00:00.000Z',
      packageName: 'Premium',
      totalPrice: 1000,
    },
    correlationId: null,
  };

  let consumer: OutboxNotificationConsumer;
  let consumerInbox: { tryClaim: jest.Mock; recordProcessed: jest.Mock };
  let notificationService: { createNotification: jest.Mock };
  let usersService: { findByRoles: jest.Mock; findByEmail: jest.Mock };
  let flagsService: { isEnabled: jest.Mock };
  let manager: Record<string, never>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    manager = {};
    consumerInbox = {
      tryClaim: jest.fn().mockResolvedValue(true),
      recordProcessed: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    usersService = {
      findByRoles: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'ops-1' }]),
      findByEmail: jest.fn().mockResolvedValue({ id: 'employee-1', email: 'employee@example.com' }),
    };
    flagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) => cb(manager)),
    };

    consumer = new OutboxNotificationConsumer(
      dataSource as never,
      consumerInbox as never,
      notificationService as never,
      usersService as never,
      flagsService as never,
    );

    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, cb) => cb());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates booking notifications and records inbox on first delivery', async () => {
    await consumer.process(envelope);

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true);
    expect(consumerInbox.tryClaim).toHaveBeenCalledWith('outbox-notification-consumer', envelope.eventId, manager);
    expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        tenantId: 'tenant-1',
        type: NotificationType.BOOKING_CREATED,
        metadata: expect.objectContaining({ bookingId: 'booking-1', totalPrice: 1000 }),
      }),
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalledWith(
      'outbox-notification-consumer',
      envelope.eventId,
      manager,
    );
  });

  it('creates task assignment notification from producer payload', async () => {
    await consumer.process({
      ...envelope,
      eventId: 'evt-task-assigned-1',
      eventType: 'TaskAssignedEvent',
      aggregateType: 'Task',
      aggregateId: 'task-1',
      payload: {
        taskId: 'task-1',
        tenantId: 'tenant-1',
        employeeName: 'employee@example.com',
        employeeEmail: 'employee@example.com',
        processingTypeName: 'Photography',
        clientName: 'Client Corp',
        eventDate: '2030-06-15T00:00:00.000Z',
        commission: 250,
      },
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith('employee@example.com', 'tenant-1');
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'employee-1',
        tenantId: 'tenant-1',
        type: NotificationType.TASK_ASSIGNED,
        title: 'Task Assigned',
        metadata: expect.objectContaining({
          taskId: 'task-1',
          employeeEmail: 'employee@example.com',
          processingTypeName: 'Photography',
          commission: 250,
        }),
      }),
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalled();
  });

  it('creates task completion notification from producer payload', async () => {
    await consumer.process({
      ...envelope,
      eventId: 'evt-task-completed-1',
      eventType: 'TaskCompletedEvent',
      aggregateType: 'Task',
      aggregateId: 'task-1',
      payload: {
        taskId: 'task-1',
        tenantId: 'tenant-1',
        completedAt: '2030-06-15T10:00:00.000Z',
        commissionAccrued: 125,
        assignedUserId: 'employee-1',
      },
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'employee-1',
        tenantId: 'tenant-1',
        type: NotificationType.TASK_COMPLETED,
        title: 'Task Completed',
        metadata: expect.objectContaining({
          taskId: 'task-1',
          assignedUserId: 'employee-1',
          commissionAccrued: 125,
        }),
      }),
    );
    expect(consumerInbox.recordProcessed).toHaveBeenCalled();
  });

  it('no-ops when durable notification kill switch is off', async () => {
    flagsService.isEnabled.mockReturnValue(false);

    await consumer.process(envelope);

    expect(consumerInbox.tryClaim).not.toHaveBeenCalled();
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('skips create on inbox dedupe', async () => {
    consumerInbox.tryClaim.mockResolvedValue(false);

    await consumer.process(envelope);

    expect(notificationService.createNotification).not.toHaveBeenCalled();
    expect(consumerInbox.recordProcessed).not.toHaveBeenCalled();
  });

  it('throws when tenantId is missing', async () => {
    await expect(consumer.process({ ...envelope, tenantId: null })).rejects.toThrow(/missing tenantId/);
  });
});
