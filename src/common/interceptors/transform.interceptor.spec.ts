import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  const mockResponse = {
    statusCode: 200,
  };

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => mockResponse,
    }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransformInterceptor],
    }).compile();

    interceptor = module.get<TransformInterceptor<any>>(TransformInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should transform data into standard response format', (done) => {
      const testData = { id: '123', name: 'Test' };
      const mockCallHandler: CallHandler = {
        handle: () => of(testData),
      };

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toHaveProperty('data', testData);
          expect(result).toHaveProperty('statusCode', 200);
          expect(result).toHaveProperty('timestamp');
          expect(typeof result.timestamp).toBe('string');
          done();
        });
    });

    it('should handle array data', (done) => {
      const testData = [{ id: '1' }, { id: '2' }];
      const mockCallHandler: CallHandler = {
        handle: () => of(testData),
      };

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.data).toEqual(testData);
          expect(result.data).toHaveLength(2);
          done();
        });
    });

    it('should handle null data', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of(null),
      };

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.data).toBeNull();
          expect(result.statusCode).toBe(200);
          done();
        });
    });

    it('should handle undefined data', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of(undefined),
      };

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.data).toBeUndefined();
          expect(result.statusCode).toBe(200);
          done();
        });
    });

    it('should reflect correct status code', (done) => {
      mockResponse.statusCode = 201;
      const testData = { created: true };
      const mockCallHandler: CallHandler = {
        handle: () => of(testData),
      };

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.statusCode).toBe(201);
          mockResponse.statusCode = 200; // Reset
          done();
        });
    });
  });
});
