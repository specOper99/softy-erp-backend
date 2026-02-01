import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  RequestTimeoutException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SelectQueryBuilder } from 'typeorm';
import { WEBHOOK_CONSTANTS } from '../../common/constants';
import { EncryptionService } from '../../common/services/encryption.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { Webhook } from './entities/webhook.entity';
import { WebhookRepository } from './repositories/webhook.repository';
import { WEBHOOK_QUEUE, WebhookConfig, WebhookEvent, WebhookJobData } from './webhooks.types';

type PLimit = typeof import('p-limit').default;
type ConcurrencyLimit = ReturnType<PLimit>;

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
  private concurrencyLimitPromise?: Promise<ConcurrencyLimit>;

  private getConcurrencyLimit(): Promise<ConcurrencyLimit> {
    if (!this.concurrencyLimitPromise) {
      this.concurrencyLimitPromise = import('p-limit').then(({ default: pLimit }) =>
        pLimit(WEBHOOK_CONSTANTS.MAX_CONCURRENCY),
      );
    }
    return this.concurrencyLimitPromise;
  }

  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly encryptionService: EncryptionService,
    @Optional()
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue?: Queue<WebhookJobData>,
  ) {}

  /**
   * Register a webhook endpoint for a tenant (persisted in DB)
   */
  async registerWebhook(config: WebhookConfig): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // URL Validation
    let url: URL;
    try {
      url = new URL(config.url);
      if (url.protocol !== 'https:') {
        throw new Error('webhooks.invalid_protocol');
      }
    } catch (error) {
      // Fail closed: invalid URL must not be persisted.
      this.logger.warn(
        `Invalid webhook URL for tenant ${tenantId}: ${config.url} (${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'})`,
      );
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
      url: config.url,
      secret: encryptedSecret,
      events: config.events,
      resolvedIps: resolvedIps.length > 0 ? resolvedIps : undefined,
      ipsResolvedAt: resolvedIps.length > 0 ? new Date() : undefined,
    });

    await this.webhookRepository.save(webhook);
    this.logger.log(`Registered and persisted webhook for tenant ${tenantId}: ${config.url}`);
  }

  /**
   * Validate that a URL does not point to private/internal resources (SSRF prevention)
   * Returns resolved IP addresses for caching to prevent DNS rebinding attacks
   */
  private async validateUrlNotPrivate(url: URL): Promise<string[]> {
    const hostname = url.hostname;

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
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
      this.logger.warn(`DNS lookup failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`);
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
        throw new BadRequestException('webhooks.dns_rebinding_blocked');
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
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (100.64.0.0/10)
      /^198\.(1[89])\./, // Benchmarking (198.18.0.0/15)
    ];

    // IPv6 private ranges
    const ipv6PrivateRanges = [
      /^::1$/, // Loopback
      /^::ffff:127\./i, // IPv4-mapped loopback
      /^::ffff:10\./i, // IPv4-mapped private
      /^::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\./i, // IPv4-mapped private
      /^::ffff:192\.168\./i, // IPv4-mapped private
      /^::ffff:169\.254\./i, // IPv4-mapped link-local
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
    const tenantId = event.tenantId;
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    await TenantContextService.run(tenantId, async () => {
      const qb = this.webhookRepository.createQueryBuilder('webhook');
      this.applyActiveEventFilter(qb, event.type);
      const webhooks = await qb.getMany();

      const deliveries = webhooks.map(async (webhook) => {
        // Safety check for malformed webhooks
        if (!webhook.events || !Array.isArray(webhook.events)) {
          this.logger.warn(`Webhook ${webhook.id} has no events defined`);
          return;
        }

        if (!webhook.events.includes(event.type) && !webhook.events.includes('*')) {
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
          const limit = await this.getConcurrencyLimit();
          return limit(() => this.sendWebhookWithRetry(webhook, event));
        }
      });

      await Promise.allSettled(deliveries);
    });
  }

  private applyActiveEventFilter(qb: SelectQueryBuilder<Webhook>, eventType: string): void {
    qb.andWhere('webhook.isActive = :isActive', { isActive: true });

    // Webhook.events is a TypeORM simple-array (comma-separated string). Filter in DB to avoid
    // scanning all active webhooks in memory.
    const ev = eventType;
    const wc = '*';

    qb.andWhere(
      `(
        webhook.events = :evExact OR
        webhook.events LIKE :evPrefix OR
        webhook.events LIKE :evSuffix OR
        webhook.events LIKE :evMiddle OR
        webhook.events = :wcExact OR
        webhook.events LIKE :wcPrefix OR
        webhook.events LIKE :wcSuffix OR
        webhook.events LIKE :wcMiddle
      )`,
      {
        evExact: ev,
        evPrefix: `${ev},%`,
        evSuffix: `%,${ev}`,
        evMiddle: `%,${ev},%`,
        wcExact: wc,
        wcPrefix: `${wc},%`,
        wcSuffix: `%,${wc}`,
        wcMiddle: `%,${wc},%`,
      },
    );
  }

  /**
   * Deliver webhook directly (called by processor or inline fallback)
   */
  async deliverWebhook(webhook: Webhook, event: WebhookEvent): Promise<void> {
    await TenantContextService.run(webhook.tenantId, async () => {
      // Background processor passes a partial entity (no resolvedIps). Load full record.
      const fullWebhook =
        webhook.resolvedIps === undefined
          ? await this.webhookRepository.findOne({
              where: { id: webhook.id },
            })
          : webhook;

      if (!fullWebhook) {
        throw new NotFoundException('webhooks.not_found');
      }

      await this.sendWebhookOnce(fullWebhook, event);
    });
  }

  /**
   * Send webhook with exponential backoff retry and jitter
   */
  private async sendWebhookWithRetry(webhook: Webhook, event: WebhookEvent): Promise<void> {
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
  private async sendWebhookOnce(webhook: Webhook, event: WebhookEvent): Promise<void> {
    const url = new URL(webhook.url);
    if (url.protocol !== 'https:') {
      throw new BadRequestException('webhooks.invalid_protocol');
    }

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
    const signature = this.createSignature(`${timestamp}.${body}`, decryptedSecret);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.WEBHOOK_TIMEOUT);

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
        throw new BadRequestException('webhooks.redirect_blocked');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(`Webhook delivered to ${webhook.url} for event ${event.type}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RequestTimeoutException('webhooks.request_timeout');
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
