import { ConfigService } from '@nestjs/config';
import {
  DiskHealthIndicator,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { S3HealthIndicator, SmtpHealthIndicator } from './indicators';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn().mockImplementation((checks) => {
              // Execute the checks to get coverage
              checks.forEach((c: any) => c());
              return Promise.resolve({ status: 'ok' });
            }),
          },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: {
            pingCheck: jest
              .fn()
              .mockResolvedValue({ database: { status: 'up' } }),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            checkHeap: jest
              .fn()
              .mockResolvedValue({ memory_heap: { status: 'up' } }),
            checkRSS: jest
              .fn()
              .mockResolvedValue({ memory_rss: { status: 'up' } }),
          },
        },
        {
          provide: DiskHealthIndicator,
          useValue: {
            checkStorage: jest
              .fn()
              .mockResolvedValue({ disk: { status: 'up' } }),
          },
        },
        {
          provide: S3HealthIndicator,
          useValue: {
            isHealthy: jest
              .fn()
              .mockResolvedValue({ storage_s3: { status: 'up' } }),
          },
        },
        {
          provide: SmtpHealthIndicator,
          useValue: {
            isHealthy: jest
              .fn()
              .mockResolvedValue({ email_smtp: { status: 'up' } }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TEST_ERROR_KEY') return 'secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health status', async () => {
      const result = await controller.check();
      expect(result.status).toBe('ok');
      expect(healthCheckService.check).toHaveBeenCalled();
    });

    it('should call detailed health check', async () => {
      const result = await controller.checkDetailed();
      expect(result.status).toBe('ok');
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });

  describe('liveness', () => {
    it('should return status ok', () => {
      expect(controller.liveness()).toEqual({ status: 'ok' });
    });
  });

  describe('readiness', () => {
    it('should call health check with db ping', async () => {
      await controller.readiness();
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });

  describe('testError', () => {
    it('should throw error if key matches', () => {
      expect(() => controller.testError('secret')).toThrow(
        'This is a test error',
      );
    });

    it('should throw unauthorized if key mismatches', () => {
      expect(() => controller.testError('wrong')).toThrow();
    });

    it('should throw bad request if key missing', () => {
      expect(() => controller.testError('')).toThrow();
    });
  });
});
