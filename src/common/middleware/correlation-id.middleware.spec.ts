import { Request, Response } from 'express';
import { asyncLocalStorage } from '../logger/request-context';
import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
} from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should generate correlation ID when not provided', () => {
      const mockRequest = {
        headers: {},
        method: 'GET',
        originalUrl: '/api/v1/test',
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const mockResponse = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        CORRELATION_ID_HEADER,
        expect.any(String),
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing correlation ID from header', () => {
      const existingId = 'existing-correlation-id';
      const mockRequest = {
        headers: { 'x-correlation-id': existingId },
        method: 'POST',
        originalUrl: '/api/v1/test',
        ip: '192.168.1.1',
      } as unknown as Request;

      const mockResponse = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        CORRELATION_ID_HEADER,
        existingId,
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set request context in async local storage', (done) => {
      const mockRequest = {
        headers: {},
        method: 'GET',
        originalUrl: '/api/v1/context-test',
        ip: '10.0.0.1',
      } as unknown as Request;

      const mockResponse = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const mockNext = jest.fn(() => {
        const context = asyncLocalStorage.getStore();
        expect(context).toBeDefined();
        expect(context?.method).toBe('GET');
        expect(context?.path).toBe('/api/v1/context-test');
        expect(context?.ip).toBe('10.0.0.1');
        done();
      });

      middleware.use(mockRequest, mockResponse, mockNext);
    });

    it('should handle missing IP gracefully', () => {
      const mockRequest = {
        headers: {},
        method: 'GET',
        originalUrl: '/api/v1/test',
        ip: undefined,
        socket: { remoteAddress: '192.168.0.1' },
      } as unknown as Request;

      const mockResponse = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
