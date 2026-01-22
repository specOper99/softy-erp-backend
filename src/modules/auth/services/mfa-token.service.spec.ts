import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { MfaTokenService } from './mfa-token.service';

describe('MfaTokenService', () => {
  let service: MfaTokenService;
  let _cacheService: CacheUtilsService;

  const mockCacheService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaTokenService,
        {
          provide: CacheUtilsService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<MfaTokenService>(MfaTokenService);
    _cacheService = module.get<CacheUtilsService>(CacheUtilsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create temp token', async () => {
    const payload = { userId: 'u1', tenantId: 't1', rememberMe: true };
    const token = await service.createTempToken(payload);

    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
    expect(mockCacheService.set).toHaveBeenCalledWith(
      expect.stringContaining('mfa:temp:'),
      payload,
      expect.any(Number),
    );
  });

  it('should get temp token', async () => {
    mockCacheService.get.mockResolvedValue({ userId: 'u1' });
    const payload = await service.getTempToken('token');
    expect(payload).toEqual({ userId: 'u1' });
    expect(mockCacheService.get).toHaveBeenCalledWith('mfa:temp:token');
  });

  it('should consume temp token', async () => {
    await service.consumeTempToken('token');
    expect(mockCacheService.del).toHaveBeenCalledWith('mfa:temp:token');
  });
});
