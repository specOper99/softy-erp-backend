import { Controller, Get, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { minutes, SkipThrottle, Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { SkipIpRateLimit } from '../../common/decorators/skip-ip-rate-limit.decorator';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { S3HealthIndicator, SmtpHealthIndicator } from './indicators';

@ApiTags('Health')
@Controller('health')
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
  @SkipThrottle()
  @SkipIpRateLimit()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check endpoint for k8s/load balancers' })
  check() {
    return this.health.check(this.getBasicChecks());
  }

  @Get('detailed')
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @HealthCheck()
  @ApiHeader({
    name: 'x-health-key',
    required: false,
    description: 'Required in production when HEALTH_CHECK_KEY is set',
  })
  @ApiOperation({
    summary: 'Detailed health check including external services',
  })
  checkDetailed(@Headers('x-health-key') key?: string) {
    this.validateRestrictedHealthAccess(key);
    return this.health.check([
      ...this.getBasicChecks(),
      () => this.s3.isHealthy('storage_s3'),
      () => this.smtp.isHealthy('email_smtp'),
    ]);
  }

  @Get('live')
  @SkipThrottle()
  @SkipIpRateLimit()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe - is the app running?' })
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @SkipThrottle()
  @SkipIpRateLimit()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe - is the app ready to receive traffic?',
  })
  readiness() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }

  @Get('deep')
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @HealthCheck()
  @ApiHeader({
    name: 'x-health-key',
    required: false,
    description: 'Required in production when HEALTH_CHECK_KEY is set',
  })
  @ApiOperation({
    summary: 'Deep health check - all dependencies including storage',
  })
  deepHealth(@Headers('x-health-key') key?: string) {
    this.validateRestrictedHealthAccess(key);
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
  @Throttle({ default: { limit: 3, ttl: minutes(1) } }) // Only 3 attempts per minute
  @ApiOperation({
    summary: 'Test endpoint to trigger an error (for Sentry testing)',
  })
  @ApiHeader({ name: 'x-test-error-key', required: true, description: 'Secret key to authorize the error test' })
  testError(@Headers('x-test-error-key') key: string) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new HttpException('health.endpoint_disabled', HttpStatus.NOT_FOUND);
    }

    if (this.configService.get<string>('TEST_ERROR_ENABLED') !== 'true') {
      throw new HttpException('health.endpoint_disabled', HttpStatus.NOT_FOUND);
    }

    const secretKey = this.configService.get<string>('TEST_ERROR_KEY');

    if (!secretKey) {
      throw new HttpException('health.endpoint_disabled', HttpStatus.NOT_FOUND);
    }

    if (!key) {
      throw new HttpException('health.missing_key', HttpStatus.BAD_REQUEST);
    }

    const keyBuffer = Buffer.from(key);
    const secretBuffer = Buffer.from(secretKey);
    const sameLength = keyBuffer.length === secretBuffer.length;
    const valid = sameLength && timingSafeEqual(keyBuffer, secretBuffer);

    if (!valid) {
      throw new HttpException('health.invalid_key', HttpStatus.UNAUTHORIZED);
    }

    // Throw an unhandled error to test Sentry
    throw new Error('health.test_error');
  }

  private validateRestrictedHealthAccess(key?: string): void {
    const secretKey = this.configService.get<string>('HEALTH_CHECK_KEY');
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isProduction = nodeEnv === 'production';

    if (!secretKey) {
      if (isProduction) {
        throw new HttpException('health.endpoint_disabled', HttpStatus.NOT_FOUND);
      }
      return;
    }

    if (!key) {
      throw new HttpException('health.missing_key', HttpStatus.UNAUTHORIZED);
    }

    const keyBuffer = Buffer.from(key);
    const secretBuffer = Buffer.from(secretKey);
    const sameLength = keyBuffer.length === secretBuffer.length;
    const valid = sameLength && timingSafeEqual(keyBuffer, secretBuffer);

    if (!valid) {
      throw new HttpException('health.invalid_key', HttpStatus.UNAUTHORIZED);
    }
  }
}
