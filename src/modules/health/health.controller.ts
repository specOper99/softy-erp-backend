import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
    DiskHealthIndicator,
    HealthCheck,
    HealthCheckService,
    MemoryHealthIndicator,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@ApiTags('Health')
@Controller('health')
@SkipThrottle() // Health checks should not be rate limited
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private db: TypeOrmHealthIndicator,
        private memory: MemoryHealthIndicator,
        private disk: DiskHealthIndicator,
    ) { }

    @Get()
    @HealthCheck()
    @ApiOperation({ summary: 'Health check endpoint for k8s/load balancers' })
    check() {
        return this.health.check([
            // Database health check
            () => this.db.pingCheck('database'),
            // Memory heap usage < 150MB
            () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
            // RSS memory < 300MB
            () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
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
    @ApiOperation({ summary: 'Readiness probe - is the app ready to receive traffic?' })
    readiness() {
        return this.health.check([
            () => this.db.pingCheck('database'),
        ]);
    }

    @Get('test-error')
    @SkipThrottle({ default: false }) // Re-enable throttling for this endpoint
    @Throttle({ default: { limit: 3, ttl: 60000 } }) // Only 3 attempts per minute
    @ApiOperation({ summary: 'Test endpoint to trigger an error (for Sentry testing)' })
    @ApiQuery({ name: 'key', required: true, description: 'Secret key to authorize the error test' })
    testError(@Query('key') key: string) {
        const secretKey = process.env.TEST_ERROR_KEY || 'test-error-secret';

        if (!key) {
            throw new HttpException('Missing key parameter', HttpStatus.BAD_REQUEST);
        }

        if (key !== secretKey) {
            throw new HttpException('Invalid key', HttpStatus.UNAUTHORIZED);
        }

        // Throw an unhandled error to test Sentry
        throw new Error('This is a test error for Sentry monitoring');
    }
}
