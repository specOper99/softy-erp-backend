import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { Webhook } from '../../webhooks/entities/webhook.entity';
import { KeyRotationService } from './key-rotation.service';

describe('KeyRotationService', () => {
  let service: KeyRotationService;
  let _encryptionService: EncryptionService;

  let mockWebhooks: Pick<Webhook, 'id' | 'secret' | 'tenantId'>[];

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue('encrypted'),
    decrypt: jest.fn().mockReturnValue('decrypted'),
    isEncrypted: jest.fn((s: string) => s.startsWith('v')),
    needsReencryption: jest.fn().mockReturnValue(true),
    reencrypt: jest.fn((s: string) => `v2:new-iv:new-tag:${s}`),
  };

  // Build a chainable QueryBuilder mock that ends the loop on the second call (returns [])
  const buildQbMock = () => {
    let callCount = 0;
    const qb: Record<string, jest.Mock> = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => {
        callCount++;
        // First call returns webhooks; subsequent calls return [] to exit pagination loop
        return callCount === 1 ? [...mockWebhooks.map((w) => ({ ...w }))] : [];
      }),
    };
    return qb;
  };

  let qbMock: ReturnType<typeof buildQbMock>;

  const mockWebhookRepository = {
    createQueryBuilder: jest.fn(),
    save: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    mockWebhooks = [
      { id: '1', secret: 'v1:iv:tag:encrypted1', tenantId: 'tenant-123' },
      { id: '2', secret: 'v1:iv:tag:encrypted2', tenantId: 'tenant-123' },
      { id: '3', secret: 'unencrypted-legacy', tenantId: 'tenant-123' },
    ];

    // Stub tenant context to avoid "Tenant context missing" error
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('tenant-123');

    // Fresh chainable QueryBuilder mock for each test
    qbMock = buildQbMock();
    mockWebhookRepository.createQueryBuilder.mockReturnValue(qbMock);
    mockWebhookRepository.save.mockReset();
    mockWebhookRepository.save.mockResolvedValue({});
    mockEncryptionService.reencrypt.mockReset();
    mockEncryptionService.reencrypt.mockImplementation((s: string) => `v2:new-iv:new-tag:${s}`);

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('rotateKeys', () => {
    it('should rotate all webhook secrets to the current key version', async () => {
      const result = await service.rotateKeys();

      expect(result.processed).toBe(3);
      expect(result.errors).toBe(0);

      expect(mockWebhookRepository.createQueryBuilder).toHaveBeenCalledWith('w');
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
