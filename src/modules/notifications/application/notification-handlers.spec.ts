import { Logger } from '@nestjs/common';
import { DURABLE_NOTIFICATION_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { BookingCreatedEvent } from '../../bookings/domain/events/booking-created.event';
import { TaskAssignedEvent } from '../../tasks/domain/events/task-assigned.event';
import { TaskCompletedEvent } from '../../tasks/domain/events/task-completed.event';
import { BookingCreatedNotificationHandler } from './booking-created.handler';
import { TaskAssignedNotificationHandler } from './task-assigned.handler';
import { TaskCompletedNotificationHandler } from './task-completed.handler';
import { NotificationType } from '../domain/enums/notification.enum';

describe('Notification event handlers', () => {
  const notificationService = { createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }) };
  const usersService = {
    findByRoles: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
    findByEmail: jest.fn().mockResolvedValue({ id: 'employee-1', email: 'employee@example.com' }),
  };
  const flagsService = { isEnabled: jest.fn().mockReturnValue(false) };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, cb) => cb());
    notificationService.createNotification.mockClear();
    usersService.findByRoles.mockClear();
    usersService.findByEmail.mockClear();
    flagsService.isEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BookingCreatedNotificationHandler skips legacy create when durable flag is on', async () => {
    flagsService.isEnabled.mockReturnValue(true);
    const handler = new BookingCreatedNotificationHandler(
      notificationService as never,
      usersService as never,
      flagsService as never,
    );

    await handler.handle(bookingCreatedEvent());

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('TaskAssignedNotificationHandler creates notification when durable flag is off', async () => {
    const handler = new TaskAssignedNotificationHandler(
      notificationService as never,
      usersService as never,
      flagsService as never,
    );

    await handler.handle(
      new TaskAssignedEvent(
        'task-1',
        'tenant-1',
        'employee@example.com',
        'employee@example.com',
        'Photography',
        'Client Corp',
        new Date('2030-06-15T00:00:00.000Z'),
        250,
      ),
    );

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true);
    expect(usersService.findByEmail).toHaveBeenCalledWith('employee@example.com', 'tenant-1');
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'employee-1',
        tenantId: 'tenant-1',
        type: NotificationType.TASK_ASSIGNED,
        metadata: expect.objectContaining({ taskId: 'task-1', commission: 250 }),
      }),
    );
  });

  it('TaskAssignedNotificationHandler skips legacy create when durable flag is on', async () => {
    flagsService.isEnabled.mockReturnValue(true);
    const handler = new TaskAssignedNotificationHandler(
      notificationService as never,
      usersService as never,
      flagsService as never,
    );

    await handler.handle(
      new TaskAssignedEvent(
        'task-1',
        'tenant-1',
        'employee@example.com',
        'employee@example.com',
        'Photography',
        'Client Corp',
        new Date('2030-06-15T00:00:00.000Z'),
        250,
      ),
    );

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('TaskCompletedNotificationHandler creates notification when durable flag is off', async () => {
    const handler = new TaskCompletedNotificationHandler(notificationService as never, flagsService as never);

    await handler.handle(
      new TaskCompletedEvent('task-1', 'tenant-1', new Date('2030-06-15T10:00:00.000Z'), 125, 'employee-1'),
    );

    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'employee-1',
        tenantId: 'tenant-1',
        type: NotificationType.TASK_COMPLETED,
        metadata: expect.objectContaining({ taskId: 'task-1', commissionAccrued: 125 }),
      }),
    );
  });

  it('TaskCompletedNotificationHandler skips legacy create when durable flag is on', async () => {
    flagsService.isEnabled.mockReturnValue(true);
    const handler = new TaskCompletedNotificationHandler(notificationService as never, flagsService as never);

    await handler.handle(
      new TaskCompletedEvent('task-1', 'tenant-1', new Date('2030-06-15T10:00:00.000Z'), 125, 'employee-1'),
    );

    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });
});

function bookingCreatedEvent(): BookingCreatedEvent {
  return new BookingCreatedEvent(
    'booking-1',
    'tenant-1',
    'client-1',
    'client@example.com',
    'Client Name',
    'package-1',
    'Package Name',
    100,
    null,
    new Date('2030-01-01T10:00:00.000Z'),
    new Date('2030-01-01T09:00:00.000Z'),
  );
}
