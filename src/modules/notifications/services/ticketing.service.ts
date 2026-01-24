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
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('TICKETING_WEBHOOK_URL');
    this.enabled = !!this.webhookUrl;
    this.timeoutMs = this.configService.get<number>('TICKETING_WEBHOOK_TIMEOUT_MS', 5000);

    if (this.enabled) {
      this.logger.log('Ticketing integration enabled');
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

    let url: URL;
    try {
      url = new URL(this.webhookUrl);
    } catch (error) {
      this.logger.error(
        `Ticketing webhook URL invalid: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'}`,
      );
      throw error instanceof Error ? error : new Error('Ticketing webhook URL invalid');
    }

    if (url.protocol !== 'https:') {
      this.logger.error('Ticketing webhook protocol must be https');
      throw new Error('Ticketing webhook protocol must be https');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ticket-Source': 'softy-erp',
        },
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          labels: payload.labels || [],
          metadata: payload.metadata || {},
          createdAt: new Date().toISOString(),
        }),
        signal: controller.signal,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        this.logger.error('Ticketing webhook redirect blocked');
        throw new Error('Ticketing webhook redirect blocked');
      }

      if (!response.ok) {
        this.logger.error(`Failed to create ticket: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to create ticket: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as { ticketId?: string; id?: string };
      const ticketId = result.ticketId || result.id || 'unknown';

      this.logger.log(`Created ticket: ${ticketId}`);
      return ticketId;
    } catch (error) {
      this.logger.error('Failed to create ticket via webhook', error);
      throw error instanceof Error ? error : new Error('Failed to create ticket via webhook');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if ticketing is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
