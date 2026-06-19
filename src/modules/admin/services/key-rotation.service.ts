import { Injectable, Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { toErrorMessage } from '../../../common/utils/error.util';
import type { EncryptionService } from '../../../common/services/encryption.service';
import type { Webhook } from '../../webhooks/entities/webhook.entity';

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    private readonly webhookRepository: Repository<Webhook>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async rotateKeys(): Promise<{ processed: number; errors: number }> {
    const webhooks = await this.webhookRepository.find({ select: ['id', 'secret'] });
    let processed = 0;
    let errors = 0;

    for (const webhook of webhooks) {
      if (!this.encryptionService.isEncrypted(webhook.secret)) {
        continue;
      }

      if (!this.encryptionService.needsReencryption(webhook.secret)) {
        continue;
      }

      try {
        const reencrypted = await this.encryptionService.reencryptAsync(webhook.secret);
        await this.webhookRepository.update(webhook.id, { secret: reencrypted });
        processed += 1;
      } catch (error) {
        errors += 1;
        this.logger.warn({
          message: 'Failed to re-encrypt webhook secret during key rotation',
          webhookId: webhook.id,
          error: toErrorMessage(error),
        });
      }
    }

    return { processed, errors };
  }
}
