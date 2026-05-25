import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { EncryptionService } from '../../common/services/encryption.service';
import { WebhookRepository } from './repositories/webhook.repository';
import type { WebhookEvent } from './webhooks.types';
import { WEBHOOK_QUEUE } from './webhooks.types';

@Injectable()
export class WebhookService {
  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  async registerWebhook(_dto: { url: string; secret: string; events: string[]; tenantId?: string }): Promise<void> {}

  async emit(_event: WebhookEvent): Promise<void> {}
}
