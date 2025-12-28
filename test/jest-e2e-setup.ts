/**
 * E2E-specific Jest setup.
 * This file contains mocks and logic designed to prevent background processes
 * from hanging in the E2E environment.
 */

// Mock ScheduleModule to prevent cron jobs, intervals, and timeouts from leaking
jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: jest.fn().mockReturnValue({ module: class {}, providers: [] }),
  },
  Cron: () => jest.fn(),
  Interval: () => jest.fn(),
  Timeout: () => jest.fn(),
}));

// Mock Redis store to prevent persistent connections
jest.mock('cache-manager-redis-yet', () => ({
  redisStore: jest.fn().mockImplementation(() =>
    Promise.resolve({
      store: 'memory',
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      mset: jest.fn(),
      mget: jest.fn(),
      mdel: jest.fn(),
      keys: jest.fn(),
      ttl: jest.fn(),
    }),
  ),
}));

// Mock AWS S3 to prevent socket leaks in connection pool
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = jest.fn().mockResolvedValue({});
    destroy = jest.fn();
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  DeleteObjectCommand: class {},
}));

// Mock S3 Request Presigner
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('http://mock-signed-url'),
}));

// Logic to ensure REDIS_URL is not set for E2E tests if it wasn't already deleted
if (process.env.REDIS_URL) {
  delete process.env.REDIS_URL;
}
