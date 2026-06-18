import { ConflictException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { of, throwError, lastValueFrom } from 'rxjs';
import { CacheUtilsService } from '../cache/cache-utils.service';
import { TenantContextService } from '../services/tenant-context.service';
import { IDEMPOTENCY_HEADER, IdempotencyInterceptor } from './idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let reflector: { get: jest.Mock };
  let cacheUtils: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const idempotencyKey = 'a-valid-key-123456';

  const mockRequest = {
    headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
  };

  const mockExecutionContext = {
    getHandler: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    reflector = { get: jest.fn() };
    cacheUtils = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('tenant-1');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: Reflector, useValue: reflector },
        { provide: CacheUtilsService, useValue: cacheUtils },
      ],
    }).compile();

    interceptor = module.get(IdempotencyInterceptor);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes through when route is not idempotent', async () => {
    reflector.get.mockReturnValue(undefined);
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    const result = await interceptor.intercept(mockExecutionContext, handler);
    await expect(lastValueFrom(result)).resolves.toEqual({ ok: true });
    expect(cacheUtils.get).not.toHaveBeenCalled();
  });

  it('returns cached body for duplicate idempotency key', async () => {
    reflector.get.mockReturnValue({ ttl: 60_000 });
    cacheUtils.get.mockResolvedValueOnce({
      status: 200,
      body: { id: 'cached-1' },
      cachedAt: Date.now(),
    });
    const handler: CallHandler = { handle: () => of({ id: 'fresh' }) };

    const result = await interceptor.intercept(mockExecutionContext, handler);
    await expect(lastValueFrom(result)).resolves.toEqual({ id: 'cached-1' });
    expect(handler.handle).toBeDefined();
  });

  it('caches successful response for new idempotency key', async () => {
    reflector.get.mockReturnValue({ ttl: 60_000 });
    const handler: CallHandler = { handle: () => of({ id: 'new-1' }) };

    const result = await interceptor.intercept(mockExecutionContext, handler);
    await expect(lastValueFrom(result)).resolves.toEqual({ id: 'new-1' });
    expect(cacheUtils.set).toHaveBeenCalledWith(
      `idempotency:tenant-1:${idempotencyKey}`,
      expect.objectContaining({ processing: true }),
      60000,
    );
  });

  it('throws when required idempotency key is missing', async () => {
    reflector.get.mockReturnValue({ required: true });
    const requestWithoutKey = { headers: {} };
    const context = {
      getHandler: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => requestWithoutKey,
      }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await expect(interceptor.intercept(context, handler)).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears processing marker when handler fails', async () => {
    reflector.get.mockReturnValue({ ttl: 60_000 });
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    const result = await interceptor.intercept(mockExecutionContext, handler);
    await expect(lastValueFrom(result)).rejects.toThrow('boom');
    expect(cacheUtils.del).toHaveBeenCalledWith(`idempotency:tenant-1:${idempotencyKey}`);
  });
});
