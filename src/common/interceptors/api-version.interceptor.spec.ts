import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { ApiVersionInterceptor } from './api-version.interceptor';

describe('ApiVersionInterceptor', () => {
  let interceptor: ApiVersionInterceptor;
  let mockResponse: { setHeader: jest.Mock };
  let mockRequest: { url: string };
  let mockExecutionContext: ExecutionContext;

  beforeEach(async () => {
    jest.resetModules(); // Ensure clean module state
    jest.clearAllMocks();

    mockResponse = { setHeader: jest.fn() };
    mockRequest = { url: '/api/v1/test' };
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiVersionInterceptor],
    }).compile();

    interceptor = module.get<ApiVersionInterceptor>(ApiVersionInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should add version headers to response', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe(() => {
        expect(mockResponse.setHeader).toHaveBeenCalledWith('X-API-Version', expect.any(String));
        expect(mockResponse.setHeader).toHaveBeenCalledWith('X-API-Min-Version', expect.any(String));
        done();
      });
    });

    it('should inject _meta into object responses', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result: any) => {
        expect(result._meta).toBeDefined();
        expect(result._meta.apiVersion).toBeDefined();
        done();
      });
    });

    it('should not inject _meta into array responses', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of([{ id: 1 }, { id: 2 }]),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result: any) => {
        expect(Array.isArray(result)).toBe(true);
        expect(result._meta).toBeUndefined();
        done();
      });
    });

    it('should not inject _meta into Buffer responses', (done) => {
      const bufferData = Buffer.from('test data');
      const mockCallHandler: CallHandler = {
        handle: () => of(bufferData),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result).toBeInstanceOf(Buffer);
        done();
      });
    });

    it('should not inject _meta into StreamableFile', (done) => {
      const streamable = new StreamableFile(Buffer.from('test'));
      const mockCallHandler: CallHandler = {
        handle: () => of(streamable),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result).toBeInstanceOf(StreamableFile);
        done();
      });
    });

    it('should return null as-is', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of(null),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result).toBeNull();
        done();
      });
    });

    it('should not inject _meta into class instances (preserve prototype)', (done) => {
      class Foo {
        constructor(public readonly value: string) {}
      }

      const foo = new Foo('x');
      const mockCallHandler: CallHandler = {
        handle: () => of(foo),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        try {
          expect(result).toBeInstanceOf(Foo);
          expect((result as any)._meta).toBeUndefined();
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });
});
