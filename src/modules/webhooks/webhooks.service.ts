import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import pLimit from 'p-limit';
import { Repository } from 'typeorm';
import { WEBHOOK_CONSTANTS } from '../../common/constants';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook } from './entities/webhook.entity';
import { WEBHOOK_QUEUE, WebhookJobData } from './processors/webhook.processor';

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

/**
 * Webhook service for sending event notifications to external systems.
 * Refactored for database persistence, exponential backoff retries,
 * URL validation, SSRF prevention, and request timeouts.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly MAX_RETRIES = WEBHOOK_CONSTANTS.MAX_RETRIES;
  private readonly INITIAL_RETRY_DELAY = WEBHOOK_CONSTANTS.INITIAL_RETRY_DELAY;
  private readonly WEBHOOK_TIMEOUT = WEBHOOK_CONSTANTS.TIMEOUT;
  private readonly MIN_SECRET_LENGTH = WEBHOOK_CONSTANTS.MIN_SECRET_LENGTH;
  private readonly concurrencyLimit = pLimit(WEBHOOK_CONSTANTS.MAX_CONCURRENCY);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    @Optional()
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue?: Queue<WebhookJobData>,
  ) {}

  /**
   * Register a webhook endpoint for a tenant (persisted in DB)
   */
  async registerWebhook(
    tenantId: string,
    config: WebhookConfig,
  ): Promise<void> {
    // URL Validation
    let url: URL;
    try {
      url = new URL(config.url);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('webhooks.invalid_protocol');
      }
    } catch {
      throw new BadRequestException('webhooks.invalid_url');
    }

    // SSRF Prevention: Block private IPs and localhost, get resolved IPs for caching
    const resolvedIps = await this.validateUrlNotPrivate(url);

    // Secret entropy validation
    if (config.secret.length < this.MIN_SECRET_LENGTH) {
      throw new BadRequestException({
        key: 'webhooks.secret_length',
        args: { min: this.MIN_SECRET_LENGTH },
      });
    }

    // Encrypt the secret before storing
    const encryptedSecret = this.encryptionService.encrypt(config.secret);

    const webhook = this.webhookRepository.create({
      tenantId,
      url: config.url,
      secret: encryptedSecret,
      events: config.events,
      resolvedIps: resolvedIps.length > 0 ? resolvedIps : undefined,
      ipsResolvedAt: resolvedIps.length > 0 ? new Date() : undefined,
    });

    await this.webhookRepository.save(webhook);
    this.logger.log(
      `Registered and persisted webhook for tenant ${tenantId}: ${config.url}`,
    );
  }

  /**
   * Validate that a URL does not point to private/internal resources (SSRF prevention)
   * Returns resolved IP addresses for caching to prevent DNS rebinding attacks
   */
  private async validateUrlNotPrivate(url: URL): Promise<string[]> {
    const hostname = url.hostname;

    // Block localhost variants
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      throw new BadRequestException('webhooks.localhost_denied');
    }

    // If hostname is already an IP, validate it directly
    if (isIP(hostname)) {
      if (this.isPrivateIp(hostname)) {
        throw new BadRequestException('webhooks.private_ip_denied');
      }
      return [hostname];
    }

    // Resolve hostname and check all addresses
    try {
      const addresses = await lookup(hostname, { all: true });
      const resolvedIps: string[] = [];
      for (const addr of addresses) {
        if (this.isPrivateIp(addr.address)) {
          throw new BadRequestException('webhooks.private_ip_denied');
        }
        resolvedIps.push(addr.address);
      }
      return resolvedIps;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(
        `DNS lookup failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fail closed: unresolved hosts are not safe to deliver to.
      throw new BadRequestException('webhooks.dns_lookup_failed');
    }
  }

  private async resolveAndValidatePublicIps(url: URL): Promise<string[]> {
    // validateUrlNotPrivate already blocks localhost/private IPs and fails closed
    return this.validateUrlNotPrivate(url);
  }

  private async assertDnsNotRebound(url: URL, allowlistedIps?: string[]) {
    if (!allowlistedIps || allowlistedIps.length === 0) {
      // No allowlist stored (legacy webhooks): still validate public IPs on each delivery.
      await this.resolveAndValidatePublicIps(url);
      return;
    }

    const currentIps = await this.resolveAndValidatePublicIps(url);
    const allowlist = new Set(allowlistedIps);
    for (const ip of currentIps) {
      if (!allowlist.has(ip)) {
        throw new Error(
          'Webhook delivery blocked: DNS changed (possible rebinding)',
        );
      }
    }
  }

  /**
   * Check if an IP address is in a private/reserved range
   */
  private isPrivateIp(ip: string): boolean {
    // IPv4 private ranges
    const ipv4PrivateRanges = [
      /^127\./, // Loopback
      /^10\./, // Class A private
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
      /^192\.168\./, // Class C private
      /^169\.254\./, // Link-local
      /^0\./, // Current network
    ];

    // IPv6 private ranges
    const ipv6PrivateRanges = [
      /^::1$/, // Loopback
      /^fe80:/i, // Link-local
      /^fc00:/i, // Unique local
      /^fd00:/i, // Unique local
    ];

    for (const range of ipv4PrivateRanges) {
      if (range.test(ip)) return true;
    }

    for (const range of ipv6PrivateRanges) {
      if (range.test(ip)) return true;
    }

    return false;
  }

  /**
   * Emit an event to all registered webhooks for the tenant.
   * If queue is available, jobs are enqueued for background processing.
   * Otherwise falls back to inline delivery with concurrency limit.
   */
  async emit(event: WebhookEvent): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { tenantId: event.tenantId, isActive: true },
    });

    const deliveries = webhooks.map(async (webhook) => {
      // Safety check for malformed webhooks
      if (!webhook.events || !Array.isArray(webhook.events)) {
        this.logger.warn(`Webhook ${webhook.id} has no events defined`);
        return;
      }

      if (
        !webhook.events.includes(event.type) &&
        !webhook.events.includes('*')
      ) {
        return;
      }

      if (this.webhookQueue) {
        // Enqueue for background processing
        await this.webhookQueue.add(
          `${event.type}-${webhook.id}`,
          {
            webhook: {
              id: webhook.id,
              tenantId: webhook.tenantId,
              url: webhook.url,
              secret: webhook.secret,
              events: webhook.events,
            },
            event,
          },
          {
            attempts: 5,
            backoff: { type: 'exponential', delay: 30000 },
          },
        );
        this.logger.log(`Queued webhook ${event.type} for ${webhook.url}`);
      } else {
        // Fallback to inline delivery with concurrency limit
        return this.concurrencyLimit(() =>
          this.sendWebhookWithRetry(webhook, event),
        );
      }
    });

    await Promise.allSettled(deliveries);
  }

  /**
   * Deliver webhook directly (called by processor or inline fallback)
   */
  async deliverWebhook(webhook: Webhook, event: WebhookEvent): Promise<void> {
    // Background processor passes a partial entity (no resolvedIps). Load full record.
    const fullWebhook =
      webhook.resolvedIps !== undefined
        ? webhook
        : await this.webhookRepository.findOne({
            where: { id: webhook.id, tenantId: webhook.tenantId },
          });

    if (!fullWebhook) {
      throw new Error('Webhook not found');
    }

    await this.sendWebhookOnce(fullWebhook, event);
  }

  /**
   * Send webhook with exponential backoff retry and jitter
   */
  private async sendWebhookWithRetry(
    webhook: Webhook,
    event: WebhookEvent,
  ): Promise<void> {
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        await this.sendWebhookOnce(webhook, event);
        return;
      } catch (error) {
        if (attempt === this.MAX_RETRIES - 1) {
          this.logger.error(
            `Webhook delivery failed to ${webhook.url} after ${this.MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        const jitter = Math.random() * baseDelay; // Random jitter between 0 and baseDelay
        const delay = baseDelay + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Single attempt to send webhook with timeout
   * SECURITY: Always re-validate DNS to prevent DNS rebinding attacks.
   * Block redirects to prevent SSRF via redirect to private IPs.
   */
  private async sendWebhookOnce(
    webhook: Webhook,
    event: WebhookEvent,
  ): Promise<void> {
    const url = new URL(webhook.url);

    // SECURITY: Validate DNS and enforce allowlisted IPs to resist DNS rebinding.
    // NOTE: To fully prevent time-of-check/time-of-use issues, pinning connections
    // to an allowlisted IP via a custom HTTP agent is required.
    await this.assertDnsNotRebound(url, webhook.resolvedIps);

    const timestamp = Date.now().toString();
    const body = JSON.stringify(event);

    // Decrypt the secret for signature creation
    const decryptedSecret = this.encryptionService.isEncrypted(webhook.secret)
      ? this.encryptionService.decrypt(webhook.secret)
      : webhook.secret; // Handle legacy unencrypted secrets

    // Include timestamp in signature to prevent replay attacks
    const signature = this.createSignature(
      `${timestamp}.${body}`,
      decryptedSecret,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.WEBHOOK_TIMEOUT,
    );

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Event': event.type,
        },
        body,
        signal: controller.signal,
        // SECURITY: Block redirects to prevent SSRF via redirect to private IPs
        redirect: 'manual',
      });

      // SECURITY: Check for redirect responses - these could lead to private IPs
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        throw new Error(
          `Webhook delivery blocked: redirect responses are not allowed (${response.status} -> ${location || 'unknown'})`,
        );
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(
        `Webhook delivered to ${webhook.url} for event ${event.type}`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Webhook request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create HMAC-SHA256 signature for webhook payload
   */
  private createSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}
