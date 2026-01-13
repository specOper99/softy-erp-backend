import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const BATCH_SIZE = 100;
    let processed = 0;
    let errors = 0;
    let skip = 0;

    while (true) {
      const webhooks = await this.webhookRepository.find({
        take: BATCH_SIZE,
        skip,
      });

      if (webhooks.length === 0) break;

      for (const webhook of webhooks) {
        try {
          let decrypted: string;

          if (this.encryptionService.isEncrypted(webhook.secret)) {
            decrypted = this.encryptionService.decrypt(webhook.secret);
          } else {
            decrypted = webhook.secret;
          }

          const reEncrypted = this.encryptionService.encrypt(decrypted);

          webhook.secret = reEncrypted;
          await this.webhookRepository.save(webhook);
          processed++;
        } catch (e) {
          this.logger.error(`Failed to rotate key for webhook ${webhook.id}`, e);
          errors++;
        }
      }

      skip += BATCH_SIZE;

      if (webhooks.length < BATCH_SIZE) break;
    }

    return { processed, errors };
  }
}
