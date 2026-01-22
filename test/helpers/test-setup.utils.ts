/**
 * Shared test mock setup patterns to eliminate duplication across test files
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { createMockMetricsFactory, createMockRepository } from './mock-factories';

/**
 * Creates a mock TypeORM SelectQueryBuilder with all chainable methods
 * Eliminates duplication across service spec files that test query-heavy logic
 */
export function createMockQueryBuilder<T extends ObjectLiteral = Record<string, unknown>>(
  getRawManyResult: unknown[] = [],
  getOneResult: unknown = null,
) {
  return {
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(getRawManyResult),
    getOne: jest.fn().mockResolvedValue(getOneResult),
    getRawMany: jest.fn().mockResolvedValue(getRawManyResult),
    getRawOne: jest.fn().mockResolvedValue(getOneResult),
    getManyAndCount: jest.fn().mockResolvedValue([getRawManyResult, getRawManyResult.length]),
    getCount: jest.fn().mockResolvedValue(getRawManyResult.length),
    execute: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
  } as unknown as jest.Mocked<SelectQueryBuilder<T>> & Record<string, jest.Mock>;
}

/**
 * Creates a standard mock ExecutionContext for guard testing
 * Eliminates duplication across guard spec files
 */
export function createMockExecutionContext(
  overrides: {
    request?: Record<string, unknown>;
    handler?: () => unknown;
    class?: new (...args: unknown[]) => unknown;
  } = {},
): ExecutionContext {
  const mockRequest = {
    headers: {},
    user: null,
    ...overrides.request,
  };

  const mockHandler = overrides.handler ?? jest.fn();
  const mockClass = overrides.class ?? class MockClass {};

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      }),
    }),
    getHandler: jest.fn().mockReturnValue(mockHandler),
    getClass: jest.fn().mockReturnValue(mockClass),
    getType: jest.fn().mockReturnValue('http'),
    getArgs: jest.fn().mockReturnValue([mockRequest]),
    getArgByIndex: jest.fn().mockImplementation((index: number) => {
      if (index === 0) return mockRequest;
      return undefined;
    }),
    switchToRpc: jest.fn().mockReturnValue({
      getContext: jest.fn(),
      getData: jest.fn(),
    }),
    switchToWs: jest.fn().mockReturnValue({
      getClient: jest.fn(),
      getData: jest.fn(),
    }),
  } as unknown as ExecutionContext;
}

/**
 * Creates a mock Reflector for guard testing
 */
export function createMockReflector(getAllAndOverrideReturn?: unknown): jest.Mocked<Reflector> {
  return {
    get: jest.fn(),
    getAll: jest.fn(),
    getAllAndMerge: jest.fn(),
    getAllAndOverride: jest.fn().mockReturnValue(getAllAndOverrideReturn),
  } as unknown as jest.Mocked<Reflector>;
}

/**
 * Creates a standard guard test module setup
 * Eliminates duplication across guard spec files
 */
export async function createGuardTestModule<T>(
  GuardClass: new (...args: unknown[]) => T,
  providers: Array<{ provide: string | symbol | (new (...args: unknown[]) => unknown); useValue: unknown }> = [],
): Promise<{ module: TestingModule; guard: T }> {
  const mockReflector = createMockReflector();

  const module = await Test.createTestingModule({
    providers: [GuardClass, { provide: Reflector, useValue: mockReflector }, ...providers],
  }).compile();

  const guard = module.get<T>(GuardClass);
  return { module, guard };
}

/**
 * Creates standard controller test providers for CRUD patterns
 * Eliminates duplication across controller spec files
 */
export function createStandardControllerProviders<TService>(
  ServiceClass: new (...args: unknown[]) => TService,
  mockService: Partial<TService>,
) {
  return [
    { provide: ServiceClass, useValue: mockService },
    { provide: 'MetricsFactory', useValue: createMockMetricsFactory() },
  ];
}

/**
 * Creates standard service test providers
 * Eliminates duplication across service spec files
 */
export function createStandardServiceProviders(
  repositoryToken: string | symbol | (new (...args: unknown[]) => unknown),
  additionalProviders: Array<{
    provide: string | symbol | (new (...args: unknown[]) => unknown);
    useValue: unknown;
  }> = [],
) {
  return [
    { provide: repositoryToken, useValue: createMockRepository() },
    { provide: 'MetricsFactory', useValue: createMockMetricsFactory() },
    ...additionalProviders,
  ];
}

/**
 * Creates a mock Express response for filter testing
 * Eliminates duplication across filter spec files
 */
export function createMockFilterResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
}

/**
 * Creates a mock Express request for filter testing
 * Eliminates duplication across filter spec files
 */
export function createMockFilterRequest(overrides: Record<string, unknown> = {}) {
  return {
    url: '/api/v1/test',
    method: 'GET',
    headers: {},
    ...overrides,
  };
}

/**
 * Creates a mock ArgumentsHost for filter testing
 * Eliminates duplication across filter spec files
 */
export function createMockArgumentsHost(
  request?: ReturnType<typeof createMockFilterRequest>,
  response?: ReturnType<typeof createMockFilterResponse>,
) {
  const mockResponse = response ?? createMockFilterResponse();
  const mockRequest = request ?? createMockFilterRequest();

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
    getArgs: jest.fn().mockReturnValue([mockRequest, mockResponse]),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
    mockResponse,
    mockRequest,
  };
}
