import type { Repository } from 'typeorm';
import type { EncryptionService } from '../../../common/services/encryption.service';
import type { Webhook } from '../../webhooks/entities/webhook.entity';
import { KeyRotationService } from './key-rotation.service';

describe('KeyRotationService', () => {
  const webhook = {
    id: 'wh-1',
    secret: 'v1:abc',
  };

  function createService(overrides?: {
    webhooks?: Array<Pick<Webhook, 'id' | 'secret'>>;
    isEncrypted?: boolean;
    needsReencryption?: boolean;
    reencryptAsync?: jest.Mock;
    update?: jest.Mock;
  }) {
    const webhookRepository = {
      find: jest.fn().mockResolvedValue(overrides?.webhooks ?? [webhook]),
      update: overrides?.update ?? jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<Webhook>;

    const encryptionService = {
      isEncrypted:
        typeof overrides?.isEncrypted === 'function'
          ? overrides.isEncrypted
          : jest.fn().mockReturnValue(overrides?.isEncrypted ?? true),
      needsReencryption:
        typeof overrides?.needsReencryption === 'function'
          ? overrides.needsReencryption
          : jest.fn().mockReturnValue(overrides?.needsReencryption ?? true),
      reencryptAsync: overrides?.reencryptAsync ?? jest.fn().mockResolvedValue('v2:new-secret'),
    } as unknown as EncryptionService;

    const service = new KeyRotationService(webhookRepository, encryptionService);

    return { service, webhookRepository, encryptionService };
  }

  it('re-encrypts webhook secrets that need rotation', async () => {
    const { service, webhookRepository, encryptionService } = createService();

    await expect(service.rotateKeys()).resolves.toEqual({ processed: 1, errors: 0 });
    expect(encryptionService.reencryptAsync).toHaveBeenCalledWith('v1:abc');
    expect(webhookRepository.update).toHaveBeenCalledWith('wh-1', { secret: 'v2:new-secret' });
  });

  it('skips plaintext and already-current secrets', async () => {
    const { service, encryptionService, webhookRepository } = createService({
      webhooks: [
        { id: 'plain', secret: 'not-encrypted' },
        { id: 'current', secret: 'v2:current' },
      ],
      isEncrypted: jest.fn().mockImplementation((value: string) => value !== 'not-encrypted'),
      needsReencryption: jest.fn().mockImplementation((value: string) => value !== 'v2:current'),
    });

    await expect(service.rotateKeys()).resolves.toEqual({ processed: 0, errors: 0 });
    expect(encryptionService.reencryptAsync).not.toHaveBeenCalled();
    expect(webhookRepository.update).not.toHaveBeenCalled();
  });

  it('counts per-row failures without aborting the batch', async () => {
    const { service } = createService({
      webhooks: [
        { id: 'bad', secret: 'v1:bad' },
        { id: 'good', secret: 'v1:good' },
      ],
      reencryptAsync: jest
        .fn()
        .mockRejectedValueOnce(new Error('decrypt failed'))
        .mockResolvedValueOnce('v2:good-secret'),
    });

    await expect(service.rotateKeys()).resolves.toEqual({ processed: 1, errors: 1 });
  });
});
