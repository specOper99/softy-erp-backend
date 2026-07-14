import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { ClientCreatedEvent } from '../../clients/domain/events/client.events';
import { WebhookService } from './webhooks.service';

@EventsHandler(ClientCreatedEvent)
export class ClientCreatedWebhookHandler implements IEventHandler<ClientCreatedEvent> {
  private readonly logger = new Logger(ClientCreatedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: ClientCreatedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for ClientCreatedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'ClientCreatedEvent', 'client', event.clientId, () =>
      this.webhookService.emit({
        type: 'client.created',
        tenantId: event.tenantId,
        payload: {
          clientId: event.clientId,
          email: event.email,
          firstName: event.firstName,
          lastName: event.lastName,
          phone: event.phone,
          tags: event.tags,
          createdAt: event.createdAt.toISOString(),
        },
        timestamp: event.createdAt.toISOString(),
      }),
    );
  }
}
