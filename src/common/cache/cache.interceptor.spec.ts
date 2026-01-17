import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';
import { CACHEABLE_KEY } from '../decorators/cacheable.decorator';
import { NO_CACHE_KEY } from '../decorators/no-cache.decorator';
import { TenantContextService } from '../services/tenant-context.service';
import { CacheUtilsService } from './cache-utils.service';
import { GlobalCacheInterceptor } from './cache.interceptor';

describe('GlobalCacheInterceptor', () => {
  let interceptor: GlobalCacheInterceptor;
  let cacheService: jest.Mocked<CacheUtilsService>;
  let reflector: Reflector;

  const mockRequest = {
    method: 'GET',
    url: '/api/v1/test',
    headers: {},
    user: { id: 'user-123' },
  };

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => mockRequest,
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalCacheInterceptor,
        Reflector,
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<GlobalCacheInterceptor>(GlobalCacheInterceptor);
    cacheService = module.get(CacheUtilsService);
    reflector = module.get<Reflector>(Reflector);

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should skip non-GET requests', async () => {
      const postRequest = { ...mockRequest, method: 'POST' };
      const postContext = {
        ...mockExecutionContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => postRequest,
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      const result = await interceptor.intercept(postContext, mockCallHandler);
      const data = await firstValueFrom(result);
      expect(data).toEqual({ data: 'test' });
    });

    it('should skip when @Cacheable not present', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const data = await firstValueFrom(result);
      expect(data).toEqual({ data: 'test' });
    });

    it('should skip when @NoCache is present', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        if (key === NO_CACHE_KEY) return true;
        return undefined;
      });

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const data = await firstValueFrom(result);
      expect(data).toEqual({ data: 'test' });
    });

    it('should skip when no tenantId', async () => {
      jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(undefined as unknown as string);
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        return undefined;
      });

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const data = await firstValueFrom(result);
      expect(data).toEqual({ data: 'test' });
    });

    it('should return cached response when available', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        return undefined;
      });
      cacheService.get.mockResolvedValue({ cached: true });

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const data = await firstValueFrom(result);
      expect(data).toEqual({ cached: true });
    });

    it('should cache response on cache miss', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        return undefined;
      });
      cacheService.get.mockResolvedValue(undefined);
      cacheService.set.mockResolvedValue(undefined);

      const mockCallHandler: CallHandler = {
        handle: () => of({ fresh: true }),
      };

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      await firstValueFrom(result);
      // Allow async cache set to complete
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should handle cache read errors gracefully', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        return undefined;
      });
      cacheService.get.mockRejectedValue(new Error('Cache read error'));

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);
      const data = await firstValueFrom(result);
      expect(data).toEqual({ data: 'test' });
    });

    it('should use user.sub when user.id not available', async () => {
      const requestWithSub = {
        ...mockRequest,
        user: { sub: 'user-sub-123' },
      };
      const contextWithSub = {
        ...mockExecutionContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithSub,
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        return undefined;
      });
      cacheService.get.mockResolvedValue(undefined);

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      await interceptor.intercept(contextWithSub, mockCallHandler);
      expect(cacheService.get).toHaveBeenCalled();
    });

    it('should use token hash when no user', async () => {
      const requestWithToken = {
        ...mockRequest,
        user: undefined,
        headers: { authorization: 'Bearer some-token' },
      };
      const contextWithToken = {
        ...mockExecutionContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithToken,
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === CACHEABLE_KEY) return true;
        return undefined;
      });
      cacheService.get.mockResolvedValue(undefined);

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      await interceptor.intercept(contextWithToken, mockCallHandler);
      expect(cacheService.get).toHaveBeenCalled();
    });
  });
});
