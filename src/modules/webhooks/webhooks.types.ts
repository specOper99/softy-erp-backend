export const WEBHOOK_QUEUE = 'webhook';

export interface WebhookEvent {
  type:
    | 'booking.created'
    | 'booking.confirmed'
    | 'booking.updated'
    | 'booking.cancelled'
    | 'task.created'
    | 'task.assigned'
    | 'task.completed'
    | 'payroll.processed';
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
}

export interface WebhookJobData {
  webhook: {
    id: string;
    tenantId: string;
    url: string;
    secret: string;
    events: string[];
  };
  event: WebhookEvent;
}
