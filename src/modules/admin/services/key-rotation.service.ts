import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { EncryptionService } from '../../../common/services/encryption.service';
import type { Webhook } from '../../webhooks/entities/webhook.entity';

@Injectable()
export class KeyRotationService {
  constructor(
    private readonly webhookRepository: Repository<Webhook>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async rotateKeys(): Promise<{ processed: number; errors: number }> {
    return { processed: 0, errors: 0 };
  }
}
