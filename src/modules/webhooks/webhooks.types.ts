export const WEBHOOK_QUEUE = 'webhooks';

export interface WebhookEvent {
  type: string;
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
