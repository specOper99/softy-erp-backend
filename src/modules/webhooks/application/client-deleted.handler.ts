import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { ClientDeletedEvent } from '../../clients/domain/events/client.events';
import { WebhookService } from './webhooks.service';

@EventsHandler(ClientDeletedEvent)
export class ClientDeletedWebhookHandler implements IEventHandler<ClientDeletedEvent> {
  private readonly logger = new Logger(ClientDeletedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: ClientDeletedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for ClientDeletedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'ClientDeletedEvent', 'client', event.clientId, () =>
      this.webhookService.emit({
        type: 'client.deleted',
        tenantId: event.tenantId,
        payload: {
          clientId: event.clientId,
          email: event.email,
          deletedAt: event.deletedAt.toISOString(),
        },
        timestamp: event.deletedAt.toISOString(),
      }),
    );
  }
}
