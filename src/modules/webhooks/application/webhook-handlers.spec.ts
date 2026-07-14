import { Logger } from '@nestjs/common';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { BookingCreatedEvent } from '../../bookings/domain/events/booking-created.event';
import { BookingConfirmedEvent } from '../../bookings/domain/events/booking-confirmed.event';
import { BookingUpdatedEvent } from '../../bookings/domain/events/booking-updated.event';
import { PackagePriceChangedEvent } from '../../catalog/domain/events/package-price-changed.event';
import { TaskCompletedEvent } from '../../tasks/domain/events/task-completed.event';
import { BookingCreatedWebhookHandler } from './booking-created.handler';
import { BookingConfirmedWebhookHandler } from './booking-confirmed.handler';
import { BookingUpdatedWebhookHandler } from './booking-updated.handler';
import { PackagePriceChangedWebhookHandler } from './package-price-changed.handler';
import { TaskCompletedWebhookHandler } from './task-completed.handler';

describe('Webhook event handlers', () => {
  const webhookService = { emit: jest.fn().mockResolvedValue(undefined) };
  const flagsService = { isEnabled: jest.fn().mockReturnValue(false) };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    webhookService.emit.mockClear();
    flagsService.isEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BookingCreatedWebhookHandler emits when durable kill switch is off', async () => {
    const handler = new BookingCreatedWebhookHandler(webhookService as never, flagsService as never);
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
    expect(flagsService.isEnabled).toHaveBeenCalledWith(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true);
    expect(webhookService.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'booking.created', tenantId: 'tenant-1' }),
    );
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling BookingCreatedEvent for webhooks: booking-1');
    expect(Logger.prototype.log).toHaveBeenCalledWith('Webhook dispatched for BookingCreatedEvent: booking-1');
  });

  it('BookingCreatedWebhookHandler skips legacy emit when durable kill switch is on', async () => {
    flagsService.isEnabled.mockReturnValue(true);
    const handler = new BookingCreatedWebhookHandler(webhookService as never, flagsService as never);
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
    expect(webhookService.emit).not.toHaveBeenCalled();
  });

  it('BookingConfirmedWebhookHandler logs dispatch lifecycle', async () => {
    const handler = new BookingConfirmedWebhookHandler(webhookService as never, flagsService as never);
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
    const handler = new BookingUpdatedWebhookHandler(webhookService as never, flagsService as never);
    const event = new BookingUpdatedEvent('booking-3', 'tenant-1', { status: 'confirmed' }, new Date());

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling BookingUpdatedEvent for webhooks: booking-3');
  });

  it('TaskCompletedWebhookHandler logs dispatch lifecycle', async () => {
    const handler = new TaskCompletedWebhookHandler(webhookService as never, flagsService as never);
    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 25, 'user-1');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith('Handling TaskCompletedEvent for webhooks: task-1');
  });

  it('PackagePriceChangedWebhookHandler skips notification when price delta is negligible', async () => {
    const handler = new PackagePriceChangedWebhookHandler(webhookService as never, flagsService as never);
    const event = new PackagePriceChangedEvent('pkg-1', 'tenant-1', 100, 100.005, 'Package');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(webhookService.emit).not.toHaveBeenCalled();
  });

  it('PackagePriceChangedWebhookHandler emits when durable kill switch is off', async () => {
    const handler = new PackagePriceChangedWebhookHandler(webhookService as never, flagsService as never);
    const event = new PackagePriceChangedEvent('pkg-2', 'tenant-1', 100, 120, 'Package');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(webhookService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'package.price_changed',
        tenantId: 'tenant-1',
        payload: expect.objectContaining({ packageId: 'pkg-2', oldPrice: 100, newPrice: 120 }),
      }),
    );
  });

  it('PackagePriceChangedWebhookHandler skips legacy emit when durable kill switch is on', async () => {
    flagsService.isEnabled.mockReturnValue(true);
    const handler = new PackagePriceChangedWebhookHandler(webhookService as never, flagsService as never);
    const event = new PackagePriceChangedEvent('pkg-2', 'tenant-1', 100, 120, 'Package');

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(webhookService.emit).not.toHaveBeenCalled();
  });
});
