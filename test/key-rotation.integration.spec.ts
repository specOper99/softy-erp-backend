import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../src/common/services/encryption.service';
import { databaseConfig } from '../src/config';
import { KeyRotationService } from '../src/modules/admin/services/key-rotation.service';
import { Webhook } from '../src/modules/webhooks/entities/webhook.entity';

// Mock Config Service to simulate key rotation
class MockConfigService {
  private readonly config = {
    database: { ...process.env }, // Partial mock, usually loaded from other config
    ENCRYPTION_KEY: 'current-key-must-be-32-chars-long!',
    ENCRYPTION_KEY_VERSION: 'v2',
    ENCRYPTION_KEY_PREVIOUS: 'previous-key-must-be-32-chars-lng',
    ENCRYPTION_KEY_PREVIOUS_VERSION: 'v1',
  };

  get(key: string) {
    if (key === 'database') return databaseConfig();
    return this.config[key as keyof typeof this.config];
  }
}

describe('Key Rotation Integration', () => {
  let moduleRef: TestingModule;
  let rotationService: KeyRotationService;
  let encryptionService: EncryptionService;
  let webhookRepository: Repository<Webhook>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (config: ConfigService) => {
            const dbConfig = config.get<Record<string, unknown>>('database') ?? {};
            return {
              type: 'postgres',
              ...dbConfig,
              entities: [Webhook],
              synchronize: true, // Needed for test
              dropSchema: true,
            };
          },
          inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([Webhook]),
      ],
      providers: [KeyRotationService, EncryptionService, { provide: ConfigService, useClass: MockConfigService }],
    }).compile();

    rotationService = moduleRef.get<KeyRotationService>(KeyRotationService);
    encryptionService = moduleRef.get<EncryptionService>(EncryptionService);
    webhookRepository = moduleRef.get<Repository<Webhook>>('WebhookRepository');
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should rotate keys from v1 to v2', async () => {
    // 1. Manually create a "Legacy" v1 encrypted secret
    // To do this strictly, we'd need to bypass the service which uses "current" key.
    // Or we can manually construct the v1 string if we know the format.
    // Format: v1:IV:Tag:Cipher
    // Let's rely on EncryptionService internals being accessible or mock them?
    // Actually, we can use the MockConfigService to temporarily swap keys? No, it's singleton.

    // Better: Instantiate a separate EncryptionService just for setup with OLD layout
    const oldConfigMock = {
      get: (k: string) => {
        if (k === 'ENCRYPTION_KEY') return 'previous-key-must-be-32-chars-lng'; // OLD Key as Current
        if (k === 'ENCRYPTION_KEY_VERSION') return 'v1';
        return null;
      },
    } as unknown as ConfigService;
    const oldEncryptionService = new EncryptionService(oldConfigMock);

    const originalSecret = 'my-super-secret-api-key';
    const v1Encrypted = oldEncryptionService.encrypt(originalSecret);

    expect(v1Encrypted).toContain('v1:');

    // Save to DB
    const webhook = webhookRepository.create({
      url: 'https://example.com',
      events: ['booking.created'],
      secret: v1Encrypted,
      tenantId: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
    });
    await webhookRepository.save(webhook);

    // 2. Run Rotation with the "Real" Service (which has v2 as Current and v1 as Previous)
    const result = await rotationService.rotateKeys();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    // 3. Verify
    const updatedWebhook = await webhookRepository.findOne({ where: { id: webhook.id } });
    expect(updatedWebhook).toBeDefined();
    expect(updatedWebhook?.secret).toContain('v2:');

    // 4. Verify Decryption with new service works
    const decrypted = encryptionService.decrypt(updatedWebhook!.secret);
    expect(decrypted).toBe(originalSecret);
  });
});
