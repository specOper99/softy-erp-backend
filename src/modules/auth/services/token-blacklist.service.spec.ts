import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { Cache } from 'cache-manager';
import * as crypto from 'node:crypto';
import { TokenBlacklistService } from './token-blacklist.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  const mockCache = { set: jest.fn(), get: jest.fn().mockResolvedValue('true') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenBlacklistService, { provide: CACHE_MANAGER, useValue: mockCache as unknown as Cache }],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
    jest.clearAllMocks();
  });

  it('hashes token when blacklisting', async () => {
    await service.blacklist('secret-token', 60);
    const digest = crypto.createHash('sha256').update('secret-token').digest('hex');
    expect(mockCache.set).toHaveBeenCalledWith(`blacklist:${digest}`, 'true', expect.any(Number));
  });

  it('isBlacklisted returns true when set', async () => {
    mockCache.get.mockResolvedValue('true');
    const result = await service.isBlacklisted('secret-token');
    expect(result).toBe(true);
    const digest = crypto.createHash('sha256').update('secret-token').digest('hex');
    expect(mockCache.get).toHaveBeenCalledWith(`blacklist:${digest}`);
  });
});
