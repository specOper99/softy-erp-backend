import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { minutes, SkipThrottle, Throttle } from '@nestjs/throttler';
import { SkipIpRateLimit } from '../../common/decorators/skip-ip-rate-limit.decorator';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { S3HealthIndicator, SmtpHealthIndicator } from './indicators';

@ApiTags('Health')
@Controller('health')
@SkipThrottle() // Health checks should not be rate limited
@SkipIpRateLimit() // Health checks should not be rate limited (custom IP limiter)
@SkipTenant()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly s3: S3HealthIndicator,
    private readonly smtp: SmtpHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint for k8s/load balancers' })
  check() {
    return this.health.check(this.getBasicChecks());
  }

  @Get('detailed')
  @HealthCheck()
  @ApiOperation({
    summary: 'Detailed health check including external services',
  })
  checkDetailed() {
    return this.health.check([
      ...this.getBasicChecks(),
      () => this.s3.isHealthy('storage_s3'),
      () => this.smtp.isHealthy('email_smtp'),
    ]);
  }

  @Get('live')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe - is the app running?' })
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe - is the app ready to receive traffic?',
  })
  readiness() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }

  @Get('deep')
  @HealthCheck()
  @ApiOperation({
    summary: 'Deep health check - all dependencies including storage',
  })
  deepHealth() {
    return this.health.check([
      ...this.getBasicChecks(),
      () => this.s3.isHealthy('storage_s3'),
      () => this.smtp.isHealthy('email_smtp'),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 90 }),
    ]);
  }

  private getBasicChecks() {
    return [
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
    ];
  }
  @Get('test-error')
  @SkipThrottle({ default: false }) // Re-enable throttling for this endpoint
  @Throttle({ default: { limit: 3, ttl: minutes(1) } }) // Only 3 attempts per minute
  @ApiOperation({
    summary: 'Test endpoint to trigger an error (for Sentry testing)',
  })
  @ApiQuery({
    name: 'key',
    required: true,
    description: 'Secret key to authorize the error test',
  })
  testError(@Query('key') key: string) {
    const secretKey = this.configService.get<string>('TEST_ERROR_KEY');

    if (!secretKey) {
      throw new HttpException('health.endpoint_disabled', HttpStatus.NOT_FOUND);
    }

    if (!key) {
      throw new HttpException('health.missing_key', HttpStatus.BAD_REQUEST);
    }

    if (key !== secretKey) {
      throw new HttpException('health.invalid_key', HttpStatus.UNAUTHORIZED);
    }

    // Throw an unhandled error to test Sentry
    throw new Error('health.test_error');
  }
}
