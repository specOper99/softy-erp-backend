import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { ClientUpdatedEvent } from '../../clients/domain/events/client.events';
import { WebhookService } from './webhooks.service';

@EventsHandler(ClientUpdatedEvent)
export class ClientUpdatedWebhookHandler implements IEventHandler<ClientUpdatedEvent> {
  private readonly logger = new Logger(ClientUpdatedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: ClientUpdatedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for ClientUpdatedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'ClientUpdatedEvent', 'client', event.clientId, () =>
      this.webhookService.emit({
        type: 'client.updated',
        tenantId: event.tenantId,
        payload: {
          clientId: event.clientId,
          changes: event.changes,
          updatedAt: event.updatedAt.toISOString(),
        },
        timestamp: event.updatedAt.toISOString(),
      }),
    );
  }
}
