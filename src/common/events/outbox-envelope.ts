/**
 * Versioned durable event envelope relayed via PostgreSQL outbox → BullMQ.
 */
export interface OutboxEventEnvelope {
  eventId: string;
  eventType: string;
  eventVersion: number;
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  correlationId?: string | null;
}

export const OUTBOX_EVENTS_QUEUE = 'outbox-events';

/** Kill-switch flags per durable event category. Default ON when unset. */
export const DURABLE_FINANCIAL_EVENTS_FLAG = 'durable-financial-outbox-events';
export const DURABLE_NOTIFICATION_EVENTS_FLAG = 'durable-notification-outbox-events';
export const DURABLE_MAIL_EVENTS_FLAG = 'durable-mail-outbox-events';
export const DURABLE_WEBHOOK_EVENTS_FLAG = 'durable-webhook-outbox-events';

const FINANCIAL_EVENT_TYPES = new Set(['PaymentRecordedEvent', 'RefundRecordedEvent']);

const NOTIFICATION_EVENT_TYPES = new Set([
  'BookingCreatedEvent',
  'BookingCompletedEvent',
  'TaskAssignedEvent',
  'TaskCompletedEvent',
]);

const MAIL_EVENT_TYPES = new Set([
  'BookingConfirmedEvent',
  'BookingCancelledEvent',
  'BookingRescheduledEvent',
  'PaymentRecordedEvent',
  'TaskAssignedEvent',
]);

const WEBHOOK_EVENT_TYPES = new Set([
  'BookingCreatedEvent',
  'BookingConfirmedEvent',
  'BookingUpdatedEvent',
  'BookingCompletedEvent',
  'TaskCompletedEvent',
  'PackagePriceChangedEvent',
  'ClientCreatedEvent',
  'ClientUpdatedEvent',
  'ClientDeletedEvent',
]);

export function isFinancialOutboxEventType(eventType: string): boolean {
  return FINANCIAL_EVENT_TYPES.has(eventType);
}

export function isNotificationOutboxEventType(eventType: string): boolean {
  return NOTIFICATION_EVENT_TYPES.has(eventType);
}

export function isMailOutboxEventType(eventType: string): boolean {
  return MAIL_EVENT_TYPES.has(eventType);
}

export function isWebhookOutboxEventType(eventType: string): boolean {
  return WEBHOOK_EVENT_TYPES.has(eventType);
}

export function durableCategoryForEventType(
  eventType: string,
): 'financial' | 'notification' | 'mail' | 'webhook' | null {
  const categories = durableCategoriesForEventType(eventType);
  return categories[0] ?? null;
}

/** All durable categories an event type belongs to (events may fan out to multiple consumers). */
export function durableCategoriesForEventType(
  eventType: string,
): Array<'financial' | 'notification' | 'mail' | 'webhook'> {
  const categories: Array<'financial' | 'notification' | 'mail' | 'webhook'> = [];
  if (isFinancialOutboxEventType(eventType)) categories.push('financial');
  if (isNotificationOutboxEventType(eventType)) categories.push('notification');
  if (isMailOutboxEventType(eventType)) categories.push('mail');
  if (isWebhookOutboxEventType(eventType)) categories.push('webhook');
  return categories;
}

export function killSwitchFlagForCategory(category: 'financial' | 'notification' | 'mail' | 'webhook'): string {
  switch (category) {
    case 'financial':
      return DURABLE_FINANCIAL_EVENTS_FLAG;
    case 'notification':
      return DURABLE_NOTIFICATION_EVENTS_FLAG;
    case 'mail':
      return DURABLE_MAIL_EVENTS_FLAG;
    case 'webhook':
      return DURABLE_WEBHOOK_EVENTS_FLAG;
  }
}
