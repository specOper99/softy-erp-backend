import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsGuard } from './metrics.guard';

describe('MetricsGuard', () => {
  let guard: MetricsGuard;
  let configService: jest.Mocked<ConfigService>;
  let mockContext: ExecutionContext;

  const createMockContext = (authHeader?: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: authHeader,
          },
        }),
      }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new MetricsGuard(configService);
  });

  describe('when METRICS_TOKEN is not configured', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'METRICS_TOKEN') return undefined;
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });
    });

    it('should allow access in development without token', () => {
      mockContext = createMockContext();
      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should throw UnauthorizedException in production', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'METRICS_TOKEN') return undefined;
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      mockContext = createMockContext();
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });
  });

  describe('when METRICS_TOKEN is configured', () => {
    const testToken = 'test-metrics-token-12345';

    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'METRICS_TOKEN') return testToken;
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });
    });

    it('should allow access with valid bearer token', () => {
      mockContext = createMockContext(`Bearer ${testToken}`);
      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should throw UnauthorizedException without Authorization header', () => {
      mockContext = createMockContext();
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with invalid token', () => {
      mockContext = createMockContext('Bearer invalid-token');
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with wrong format', () => {
      mockContext = createMockContext(testToken); // Missing "Bearer " prefix
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with empty bearer token', () => {
      mockContext = createMockContext('Bearer ');
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });
  });

  describe('timing-safe comparison', () => {
    const testToken = 'secure-token';

    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'METRICS_TOKEN') return testToken;
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });
    });

    it('should reject tokens of different lengths', () => {
      mockContext = createMockContext('Bearer short');
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });

    it('should reject tokens of same length but different content', () => {
      mockContext = createMockContext('Bearer secure-xxxxx');
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    });
  });
});
