import { Test, TestingModule } from '@nestjs/testing';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { BookingUpdatedEvent } from '../../bookings/events/booking-updated.event';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { WebhookService } from '../webhooks.service';
import { BookingConfirmedWebhookHandler } from './booking-confirmed.handler';
import { BookingUpdatedWebhookHandler } from './booking-updated.handler';
import { TaskCompletedWebhookHandler } from './task-completed.handler';

describe('Webhook Handlers', () => {
  let webhookService: WebhookService;
  let bookingConfirmedHandler: BookingConfirmedWebhookHandler;
  let bookingUpdatedHandler: BookingUpdatedWebhookHandler;
  let taskCompletedHandler: TaskCompletedWebhookHandler;

  const mockWebhookService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConfirmedWebhookHandler,
        BookingUpdatedWebhookHandler,
        TaskCompletedWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    webhookService = module.get<WebhookService>(WebhookService);
    bookingConfirmedHandler = module.get<BookingConfirmedWebhookHandler>(
      BookingConfirmedWebhookHandler,
    );
    bookingUpdatedHandler = module.get<BookingUpdatedWebhookHandler>(
      BookingUpdatedWebhookHandler,
    );
    taskCompletedHandler = module.get<TaskCompletedWebhookHandler>(
      TaskCompletedWebhookHandler,
    );

    jest.clearAllMocks();
  });

  describe('BookingConfirmedWebhookHandler', () => {
    it('should emit webhook on BookingConfirmedEvent', async () => {
      const event = new BookingConfirmedEvent(
        'booking-id',
        'tenant-id',
        'client@example.com',
        'Client Name',
        'Package Name',
        100,
        new Date(),
      );

      await bookingConfirmedHandler.handle(event);

      expect(webhookService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking.confirmed',
          tenantId: 'tenant-id',
          payload: expect.objectContaining({
            bookingId: 'booking-id',
            clientEmail: 'client@example.com',
          }),
        }),
      );
    });
  });

  describe('BookingUpdatedWebhookHandler', () => {
    it('should emit webhook on BookingUpdatedEvent', async () => {
      const event = new BookingUpdatedEvent(
        'booking-id',
        'tenant-id',
        { status: 'CONFIRMED' },
        new Date(),
      );

      await bookingUpdatedHandler.handle(event);

      expect(webhookService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking.updated',
          tenantId: 'tenant-id',
          payload: expect.objectContaining({
            bookingId: 'booking-id',
            changes: { status: 'CONFIRMED' },
          }),
        }),
      );
    });
  });

  describe('TaskCompletedWebhookHandler', () => {
    it('should emit webhook on TaskCompletedEvent', async () => {
      const event = new TaskCompletedEvent(
        'task-id',
        'tenant-id',
        new Date(),
        50,
        'user-id',
      );

      await taskCompletedHandler.handle(event);

      expect(webhookService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.completed',
          tenantId: 'tenant-id',
          payload: expect.objectContaining({
            taskId: 'task-id',
            assignedUserId: 'user-id',
            commissionAccrued: 50,
          }),
        }),
      );
    });
  });
});
