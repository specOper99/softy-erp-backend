export const WEBHOOK_QUEUE = 'webhooks';

export interface WebhookEvent {
  type: string;
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
