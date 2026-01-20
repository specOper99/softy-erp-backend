import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EncryptionService } from '../../../common/services/encryption.service';
import { Webhook } from '../../webhooks/entities/webhook.entity';
import { KeyRotationService } from './key-rotation.service';

describe('KeyRotationService', () => {
  let service: KeyRotationService;
  let _encryptionService: EncryptionService;
  let _webhookRepository: ReturnType<typeof jest.fn>;

  let mockWebhooks: any[];

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue('encrypted'),
    decrypt: jest.fn().mockReturnValue('decrypted'),
    isEncrypted: jest.fn((s) => s.startsWith('v')),
    needsReencryption: jest.fn().mockReturnValue(true),
    reencrypt: jest.fn((s) => `v2:new-iv:new-tag:${s}`),
  };

  const _mockGeoIpService = {
    lookup: jest.fn().mockResolvedValue({
      country: 'US',
      city: 'New York',
      ll: [40.7128, -74.006],
    }),
  };

  const mockWebhookRepository = {
    find: jest.fn().mockImplementation(() => Promise.resolve([...mockWebhooks.map((w) => ({ ...w }))])),
    save: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    mockWebhooks = [
      { id: '1', secret: 'v1:iv:tag:encrypted1' },
      { id: '2', secret: 'v1:iv:tag:encrypted2' },
      { id: '3', secret: 'unencrypted-legacy' },
    ];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyRotationService,
        { provide: EncryptionService, useValue: mockEncryptionService },
        {
          provide: getRepositoryToken(Webhook),
          useValue: mockWebhookRepository,
        },
      ],
    }).compile();

    service = module.get<KeyRotationService>(KeyRotationService);
    _encryptionService = module.get<EncryptionService>(EncryptionService);
    _webhookRepository = module.get(getRepositoryToken(Webhook));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('rotateKeys', () => {
    it('should rotate all webhook secrets to the current key version', async () => {
      mockEncryptionService.reencrypt.mockImplementation((s) => `v2:new-iv:new-tag:${s}`);

      const result = await service.rotateKeys();

      expect(result.processed).toBe(3);
      expect(result.errors).toBe(0);

      expect(mockWebhookRepository.find).toHaveBeenCalled();
      expect(mockWebhookRepository.save).toHaveBeenCalledTimes(3);

      // Verify re-encryption calls
      expect(mockEncryptionService.reencrypt).toHaveBeenCalledWith('v1:iv:tag:encrypted1');
      expect(mockEncryptionService.reencrypt).toHaveBeenCalledWith('v1:iv:tag:encrypted2');
      expect(mockEncryptionService.reencrypt).toHaveBeenCalledWith('unencrypted-legacy');
    });

    it('should track errors if rotation fails for some entities', async () => {
      mockEncryptionService.reencrypt.mockImplementation((s: string) => {
        if (s === 'v1:iv:tag:encrypted1') throw new Error('Fail');
        return `v2:new-iv:new-tag:${s}`;
      });

      const result = await service.rotateKeys();

      expect(result.processed).toBe(2);
      expect(result.errors).toBe(1);
    });
  });
});
