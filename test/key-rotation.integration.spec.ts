import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { EncryptionService } from '../src/common/services/encryption.service';
import { KeyRotationService } from '../src/modules/admin/services/key-rotation.service';
import { Webhook } from '../src/modules/webhooks/entities/webhook.entity';

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'ENCRYPTION_KEY') return 'current-key-must-be-32-chars-long!';
    if (key === 'ENCRYPTION_KEY_VERSION') return 'v2';
    if (key === 'ENCRYPTION_KEY_PREVIOUS') return 'previous-key-must-be-32-chars-lng';
    if (key === 'ENCRYPTION_KEY_PREVIOUS_VERSION') return 'v1';
    return null;
  }),
};

describe('Key Rotation Integration', () => {
  let dataSource: DataSource;
  let rotationService: KeyRotationService;
  let encryptionService: EncryptionService;
  let webhookRepository: Repository<Webhook>;

  beforeAll(async () => {
    dataSource = globalThis.__DATA_SOURCE__;

    if (!dataSource || !dataSource.isInitialized) {
      throw new Error('DataSource not initialized. Ensure integration setup ran.');
    }

    webhookRepository = dataSource.getRepository('Webhook') as Repository<Webhook>;
    encryptionService = new EncryptionService(mockConfigService as unknown as ConfigService);
    rotationService = new KeyRotationService(webhookRepository, encryptionService);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await webhookRepository.delete({});
    }
  });

  beforeEach(async () => {
    if (dataSource?.isInitialized) {
      await webhookRepository.delete({});
    }
  });

  it('should rotate keys from v1 to v2', async () => {
    const oldConfigMock = {
      get: (k: string) => {
        if (k === 'ENCRYPTION_KEY') return 'previous-key-must-be-32-chars-lng';
        if (k === 'ENCRYPTION_KEY_VERSION') return 'v1';
        return null;
      },
    } as unknown as ConfigService;
    const oldEncryptionService = new EncryptionService(oldConfigMock);

    const originalSecret = 'my-super-secret-api-key';
    const v1Encrypted = oldEncryptionService.encrypt(originalSecret);

    expect(v1Encrypted).toContain('v1:');

    const webhook = webhookRepository.create({
      url: 'https://example.com',
      events: ['booking.created'],
      secret: v1Encrypted,
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
    });
    await webhookRepository.save(webhook);

    const result = await rotationService.rotateKeys();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    const updatedWebhook = await webhookRepository.findOne({ where: { id: webhook.id } });
    expect(updatedWebhook).toBeDefined();
    expect(updatedWebhook?.secret).toContain('v2:');

    const decrypted = encryptionService.decrypt(updatedWebhook!.secret);
    expect(decrypted).toBe(originalSecret);
  });
});
