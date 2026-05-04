import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { Webhook } from '../../webhooks/entities/webhook.entity';

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Iterate over all entities with encrypted fields and re-encrypt them
   * using the currently active encryption key.
   */
  async rotateKeys(): Promise<{ processed: number; errors: number }> {
    this.logger.log('Starting encryption key rotation process...');

    // 1. Rotate Webhook Secrets
    const webhookResult = await this.rotateWebhookSecrets();

    this.logger.log(`Key rotation complete. Processed: ${webhookResult.processed}, Errors: ${webhookResult.errors}`);

    return webhookResult;
  }

  private async rotateWebhookSecrets(): Promise<{
    processed: number;
    errors: number;
  }> {
    // Scope rotation to the calling tenant only — must never touch other tenants' data.
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const BATCH_SIZE = 100;
    let processed = 0;
    let errors = 0;
    let lastId: string | undefined;

    while (true) {
      // Use keyset pagination with ORDER BY to avoid page-shift when rows are mutated.
      const qb = this.webhookRepository
        .createQueryBuilder('w')
        .where('w.tenantId = :tenantId', { tenantId })
        .orderBy('w.id', 'ASC')
        .take(BATCH_SIZE);

      if (lastId) {
        qb.andWhere('w.id > :lastId', { lastId });
      }

      const webhooks = await qb.getMany();

      if (webhooks.length === 0) break;

      for (const webhook of webhooks) {
        try {
          if (this.encryptionService.needsReencryption(webhook.secret)) {
            const reEncrypted = this.encryptionService.reencrypt(webhook.secret);
            webhook.secret = reEncrypted;
            await this.webhookRepository.save(webhook);
            processed++;
          } else {
            // Record is already up to date, just continue
          }
        } catch (e) {
          this.logger.error(`Failed to rotate key for webhook ${webhook.id}`, e);
          errors++;
        }
        lastId = webhook.id;
      }

      if (webhooks.length < BATCH_SIZE) break;
    }

    return { processed, errors };
  }
}
