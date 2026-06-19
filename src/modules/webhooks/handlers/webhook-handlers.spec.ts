import { Logger } from '@nestjs/common';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { BookingUpdatedEvent } from '../../bookings/events/booking-updated.event';
import { PackagePriceChangedEvent } from '../../catalog/events/package-price-changed.event';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { BookingCreatedWebhookHandler } from './booking-created.handler';
import { BookingConfirmedWebhookHandler } from './booking-confirmed.handler';
import { BookingUpdatedWebhookHandler } from './booking-updated.handler';
import { PackagePriceChangedWebhookHandler } from './package-price-changed.handler';
import { TaskCompletedWebhookHandler } from './task-completed.handler';

describe('Webhook event handlers', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BookingCreatedWebhookHandler logs dispatch lifecycle', async () => {
    const handler = new BookingCreatedWebhookHandler();
    const event = new BookingCreatedEvent(
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

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling BookingCreatedEvent for webhooks: booking-1');
    expect(Logger.prototype.log).toHaveBeenCalledWith('Webhook dispatched for BookingCreatedEvent: booking-1');
  });

  it('BookingConfirmedWebhookHandler logs dispatch lifecycle', async () => {
    const handler = new BookingConfirmedWebhookHandler();
    const event = new BookingConfirmedEvent(
      'booking-2',
      'tenant-1',
      'client@example.com',
      'Client Name',
      'Package Name',
      100,
      new Date('2030-01-02T10:00:00.000Z'),
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling BookingConfirmedEvent for webhooks: booking-2');
    expect(Logger.prototype.log).toHaveBeenCalledWith('Webhook dispatched for BookingConfirmedEvent: booking-2');
  });

  it('BookingUpdatedWebhookHandler logs dispatch lifecycle', async () => {
    const handler = new BookingUpdatedWebhookHandler();
    const event = new BookingUpdatedEvent('booking-3', 'tenant-1', { status: 'confirmed' }, new Date());

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling BookingUpdatedEvent for webhooks: booking-3');
  });

  it('TaskCompletedWebhookHandler logs dispatch lifecycle', async () => {
    const handler = new TaskCompletedWebhookHandler();
    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 25, 'user-1');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling TaskCompletedEvent for webhooks: task-1');
  });

  it('PackagePriceChangedWebhookHandler skips notification when price delta is negligible', async () => {
    const handler = new PackagePriceChangedWebhookHandler();
    const event = new PackagePriceChangedEvent('pkg-1', 'tenant-1', 100, 100.005, 'Package');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('PackagePriceChangedWebhookHandler logs dispatch when notification is required', async () => {
    const handler = new PackagePriceChangedWebhookHandler();
    const event = new PackagePriceChangedEvent('pkg-2', 'tenant-1', 100, 120, 'Package');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling PackagePriceChangedEvent for webhooks: pkg-2');
  });
});
