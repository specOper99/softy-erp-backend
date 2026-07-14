import type { OutboxEventEnvelope } from '../events/outbox-envelope';

export const OUTBOX_NOTIFICATION_CONSUMER = Symbol('OUTBOX_NOTIFICATION_CONSUMER');
export const OUTBOX_MAIL_CONSUMER = Symbol('OUTBOX_MAIL_CONSUMER');
export const OUTBOX_WEBHOOK_CONSUMER = Symbol('OUTBOX_WEBHOOK_CONSUMER');
export const OUTBOX_FINANCIAL_CONSUMER = Symbol('OUTBOX_FINANCIAL_CONSUMER');

export interface OutboxNotificationConsumerPort {
  process(envelope: OutboxEventEnvelope): Promise<void>;
}

export interface OutboxMailConsumerPort {
  process(envelope: OutboxEventEnvelope): Promise<void>;
}

export interface OutboxWebhookConsumerPort {
  process(envelope: OutboxEventEnvelope): Promise<void>;
}

export interface OutboxFinancialConsumerPort {
  process(envelope: OutboxEventEnvelope): Promise<void>;
}
