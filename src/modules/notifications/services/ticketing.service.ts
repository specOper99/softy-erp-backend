import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketPayload, TicketingProvider } from './ticketing.interface';

/**
 * Webhook-based ticketing service for creating tickets on reconciliation mismatches.
 * Sends structured payloads to a configurable webhook endpoint.
 */
@Injectable()
export class TicketingService implements TicketingProvider {
  private readonly logger = new Logger(TicketingService.name);
  private readonly webhookUrl: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('TICKETING_WEBHOOK_URL');
    this.enabled = !!this.webhookUrl;

    if (this.enabled) {
      this.logger.log(`Ticketing integration enabled: ${this.webhookUrl}`);
    } else {
      this.logger.warn('Ticketing integration disabled: TICKETING_WEBHOOK_URL not configured');
    }
  }

  /**
   * Create a ticket for a reconciliation mismatch or other issue.
   */
  async createTicket(payload: TicketPayload): Promise<string | null> {
    if (!this.enabled || !this.webhookUrl) {
      this.logger.debug('Ticketing disabled, skipping ticket creation');
      return null;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ticket-Source': 'chapters-studio-erp',
        },
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          labels: payload.labels || [],
          metadata: payload.metadata || {},
          createdAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        this.logger.error(`Failed to create ticket: ${response.status} ${response.statusText}`);
        return null;
      }

      const result = (await response.json()) as { ticketId?: string; id?: string };
      const ticketId = result.ticketId || result.id || 'unknown';

      this.logger.log(`Created ticket: ${ticketId} - ${payload.title}`);
      return ticketId;
    } catch (error) {
      this.logger.error('Failed to create ticket via webhook', error);
      return null;
    }
  }

  /**
   * Check if ticketing is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
