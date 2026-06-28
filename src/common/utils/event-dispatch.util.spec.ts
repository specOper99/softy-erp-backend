import { Logger } from '@nestjs/common';
import { runGuardedDispatch, runMailDispatch, runWebhookDispatch } from './event-dispatch.util';

describe('event-dispatch.util', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runWebhookDispatch logs lifecycle messages', async () => {
    await runWebhookDispatch(logger, 'BookingCreatedEvent', 'booking', 'id-1', () => undefined);

    expect(logger.log).toHaveBeenCalledWith('Handling BookingCreatedEvent for webhooks: id-1');
    expect(logger.log).toHaveBeenCalledWith('Webhook dispatched for BookingCreatedEvent: id-1');
  });

  it('runMailDispatch logs failure without throwing', async () => {
    await runMailDispatch(logger, 'Handling PaymentRecordedEvent for booking', 'id-2', 'payment receipt', async () => {
      throw new Error('smtp down');
    });

    expect(logger.error).toHaveBeenCalledWith('Failed to send payment receipt for id-2: smtp down');
  });

  it('runGuardedDispatch supports custom messages', async () => {
    await runGuardedDispatch(
      logger,
      { startMessage: 'start', successMessage: 'done', failureMessage: 'fail' },
      () => undefined,
    );

    expect(logger.log).toHaveBeenCalledWith('start');
    expect(logger.log).toHaveBeenCalledWith('done');
  });

  it('runGuardedDispatch skips start log when omitted', async () => {
    await runGuardedDispatch(logger, { failureMessage: 'fail' }, () => undefined);

    expect(logger.log).not.toHaveBeenCalled();
  });
});
