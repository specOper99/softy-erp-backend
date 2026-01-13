import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { MessagePackInterceptor } from './message-pack.interceptor';

describe('MessagePackInterceptor', () => {
  let interceptor: MessagePackInterceptor;

  const createMockContext = (acceptHeader?: string) => {
    const mockRequest = {
      headers: {
        accept: acceptHeader,
      },
    };

    const mockResponse = {
      setHeader: jest.fn(),
    };

    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagePackInterceptor],
    }).compile();

    interceptor = module.get<MessagePackInterceptor>(MessagePackInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should pass through when MessagePack not requested', (done) => {
      const context = createMockContext('application/json');
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(context, mockCallHandler).subscribe((result) => {
        expect(result).toEqual({ data: 'test' });
        done();
      });
    });

    it('should pass through when no Accept header', (done) => {
      const context = createMockContext(undefined);
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(context, mockCallHandler).subscribe((result) => {
        expect(result).toEqual({ data: 'test' });
        done();
      });
    });

    it('should serialize to MessagePack when requested', (done) => {
      const context = createMockContext('application/x-msgpack');
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(context, mockCallHandler).subscribe((result) => {
        expect(result).toBeInstanceOf(StreamableFile);
        done();
      });
    });

    it('should set Content-Type header for MessagePack', (done) => {
      const context = createMockContext('application/x-msgpack');
      const mockResponse = context.switchToHttp().getResponse();
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(context, mockCallHandler).subscribe(() => {
        expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-msgpack');
        done();
      });
    });

    it('should pass through StreamableFile without modification', (done) => {
      const context = createMockContext('application/x-msgpack');
      const streamable = new StreamableFile(Buffer.from('test'));
      const mockCallHandler: CallHandler = {
        handle: () => of(streamable),
      };

      interceptor.intercept(context, mockCallHandler).subscribe((result) => {
        expect(result).toBe(streamable);
        done();
      });
    });

    it('should handle complex objects', (done) => {
      const context = createMockContext('application/x-msgpack');
      const mockCallHandler: CallHandler = {
        handle: () =>
          of({
            users: [{ id: 1, name: 'Test' }],
            metadata: { count: 1, page: 1 },
          }),
      };

      interceptor.intercept(context, mockCallHandler).subscribe((result) => {
        expect(result).toBeInstanceOf(StreamableFile);
        done();
      });
    });

    it('should handle arrays', (done) => {
      const context = createMockContext('application/x-msgpack');
      const mockCallHandler: CallHandler = {
        handle: () => of([1, 2, 3, 4, 5]),
      };

      interceptor.intercept(context, mockCallHandler).subscribe((result) => {
        expect(result).toBeInstanceOf(StreamableFile);
        done();
      });
    });
  });
});
