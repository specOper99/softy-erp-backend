# Performance Optimization Guide

## Overview

This document provides comprehensive performance optimization guidelines for the Chapters Studio ERP system. It covers database optimization, caching strategies, query patterns, and infrastructure tuning.

---

## Table of Contents

1. [Database Optimization](#database-optimization)
2. [Caching Strategy](#caching-strategy)
3. [Query Optimization](#query-optimization)
4. [Memory Management](#memory-management)
5. [Concurrency and Async Patterns](#concurrency-and-async-patterns)
6. [API Performance](#api-performance)
7. [Infrastructure Tuning](#infrastructure-tuning)
8. [Monitoring and Profiling](#monitoring-and-profiling)

---

## Database Optimization

### Index Strategy

**Required Indexes:**

```sql
-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date_type
ON transactions (tenant_id, transaction_date, type)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_transactions_booking
ON transactions (booking_id)
WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_category_date
ON transactions (category, transaction_date)
WHERE is_deleted = false;

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
ON audit_logs (tenant_id, created_at DESC);

-- Refresh tokens indexes for cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_expires
ON refresh_tokens (user_id, expires_at)
WHERE is_revoked = false;

-- Employee wallet lookups
CREATE INDEX IF NOT EXISTS idx_employee_wallet_user_tenant
ON employee_wallet (user_id, tenant_id);
```

**Index Maintenance:**

```typescript
// src/database/migrations/XXXX-add-performance-indexes.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexesXXXX implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create indexes
    await queryRunner.query(`CREATE INDEX ...`);

    // Analyze tables for query planner optimization
    await queryRunner.query('ANALYZE transactions');
    await queryRunner.query('ANALYZE audit_logs');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ...');
  }
}
```

### Query Optimization Patterns

**Avoid N+1 Queries:**

```typescript
// BAD - N+1 query problem
const bookings = await this.bookingRepository.find({
  where: { tenantId },
});

for (const booking of bookings) {
  // This executes a separate query for EACH booking
  const tasks = await this.taskRepository.find({
    where: { bookingId: booking.id },
  });
  booking.tasks = tasks;
}

// GOOD - Use eager loading or query builder with joins
const bookings = await this.bookingRepository
  .createQueryBuilder('booking')
  .leftJoinAndSelect('booking.tasks', 'task')
  .where('booking.tenantId = :tenantId', { tenantId })
  .getMany();

// BETTER - Use batch loading for large datasets
const bookingIds = bookings.map((b) => b.id);
const tasksByBooking = await this.taskRepository
  .createQueryBuilder('task')
  .where('task.bookingId IN (:...bookingIds)', { bookingIds })
  .getMany()
  .then((tasks) =>
    tasks.reduce(
      (acc, task) => {
        if (!acc[task.bookingId]) {
          acc[task.bookingId] = [];
        }
        acc[task.bookingId].push(task);
        return acc;
      },
      {} as Record<string, Task[]>,
    ),
  );
```

**Use Pagination Efficiently:**

```typescript
// Offset-based pagination (for small datasets)
async getUsers(page: number = 1, limit: number = 20): Promise<{ data: User[]; total: number }> {
  const [data, total] = await this.userRepository.findAndCount({
    where: { tenantId },
    skip: (page - 1) * limit,
    take: limit,
    order: { createdAt: 'DESC' },
  });
  return { data, total };
}

// Cursor-based pagination (for large datasets, more efficient)
async getUsersCursor(
  cursor?: string,
  limit: number = 20,
): Promise<{ data: User[]; nextCursor: string | null }> {
  const qb = this.userRepository
    .createQueryBuilder('user')
    .where('user.tenantId = :tenantId', { tenantId })
    .orderBy('user.createdAt', 'DESC')
    .take(limit + 1);

  if (cursor) {
    const cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf8'));
    qb.andWhere('user.createdAt < :cursorDate', { cursorDate });
  }

  const data = await qb.getMany();
  const hasMore = data.length > limit;

  if (hasMore) {
    data.pop();
  }

  return {
    data,
    nextCursor: hasMore
      ? Buffer.from(data[data.length - 1].createdAt.toISOString()).toString('base64')
      : null,
  };
}
```

### Connection Pooling

```typescript
// src/config/database.config.ts
export default registerAs('database', () => ({
  type: 'postgres',
  // ... other config

  // Connection pool settings
  extra: {
    max: 20, // Maximum connections in pool
    min: 5, // Minimum idle connections
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 5000, // Fail if connection takes > 5 seconds
    statement_timeout: 60000, // Cancel queries > 60 seconds
  },

  // TypeORM pool
  poolSize: 10,
  connectTimeoutMS: 10000,
}));
```

---

## Caching Strategy

### Cache Layers

```
┌─────────────────────────────────────────────────────┐
│                   Application Cache                  │
│              (In-memory, per instance)              │
│                   TTL: 5-30 seconds                 │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   Redis Cache                        │
│              (Distributed, shared)                  │
│                   TTL: 1-24 hours                   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   Database                           │
│               (Persistent storage)                  │
└─────────────────────────────────────────────────────┘
```

### Cache Implementation

**Redis Cache Service:**

```typescript
// src/common/cache/cache.service.ts
@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: CacheManager,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (error) {
      this.logger.error(`Cache get failed for key: ${key}`, error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, { ttl: ttlSeconds });
    } catch (error) {
      this.logger.error(`Cache set failed for key: ${key}`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.error(`Cache delete failed for key: ${key}`, error);
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Use Redis SCAN to find and delete matching keys
    const client = this.cacheManager.store.getClient();
    const keys = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}
```

### Cache-Aside Pattern

```typescript
// src/modules/finance/services/finance.service.ts
private readonly REPORT_CACHE_TTL = 3600; // 1 hour

private getReportCacheKey(tenantId: string, reportType: string, dateRange: string): string {
  return `finance:report:${tenantId}:${reportType}:${dateRange}`;
}

async getProfitAndLoss(filter: FinancialReportFilterDto): Promise<PnLEntry[]> {
  const tenantId = TenantContextService.getTenantId();
  const dateRange = `${filter.startDate}_${filter.endDate}`;
  const cacheKey = this.getReportCacheKey(tenantId, 'pnl', dateRange);

  // Check cache first
  const cached = await this.cacheService.get<PnLEntry[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from database
  const reportData = await this.calculatePnL(filter);

  // Cache the result
  await this.cacheService.set(cacheKey, reportData, this.REPORT_CACHE_TTL);

  return reportData;
}

async invalidateReportCaches(tenantId: string): Promise<void> {
  // Invalidate all report caches for this tenant
  await this.cacheService.invalidatePattern(`finance:report:${tenantId}:*`);
}
```

### Cache Invalidation Strategy

| Data Type         | Invalidation Trigger         | Strategy               |
| ----------------- | ---------------------------- | ---------------------- |
| User preferences  | User updates preferences     | Immediate invalidation |
| Financial reports | New transaction created      | Immediate invalidation |
| Dashboard metrics | Any metrics-affecting change | Immediate invalidation |
| Service catalog   | Catalog updated              | Immediate invalidation |
| Tenant config     | Admin updates config         | Immediate invalidation |

---

## Query Optimization

### Query Builder Best Practices

```typescript
// Use SELECT only needed columns
const users = await this.userRepository
  .createQueryBuilder('user')
  .select(['user.id', 'user.email', 'user.name'])
  .where('user.tenantId = :tenantId', { tenantId })
  .getMany();

// Use WHERE clauses effectively
const activeUsers = await this.userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :isActive', { isActive: true })
  .andWhere('user.tenantId = :tenantId', { tenantId })
  .getMany();

// Use GROUP BY for aggregations
const stats = await this.transactionRepository
  .createQueryBuilder('t')
  .select('t.type', 'type')
  .addSelect('COUNT(*)', 'count')
  .addSelect('SUM(t.amount)', 'total')
  .where('t.tenantId = :tenantId', { tenantId })
  .groupBy('t.type')
  .getRawMany();
```

### Batch Operations

```typescript
// Batch insert for better performance
async bulkCreateUsers(users: CreateUserDto[]): Promise<User[]> {
  const chunkSize = 100;
  const results: User[] = [];

  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize);
    const chunkResults = await this.userRepository.save(chunk);
    results.push(...chunkResults);
  }

  return results;
}

// Batch update using IN clause
async bulkUpdateUserStatus(userIds: string[], status: UserStatus): Promise<void> {
  await this.userRepository
    .createQueryBuilder()
    .update(User)
    .set({ status })
    .where('id IN (:...userIds)', { userIds })
    .execute();
}
```

### Pagination with Large Datasets

```typescript
// Keyset pagination (better performance for large datasets)
async getTransactionsKeyset(
  lastSeenId?: string,
  lastSeenDate?: Date,
  limit: number = 50,
): Promise<{ data: Transaction[]; hasMore: boolean }> {
  const qb = this.transactionRepository
    .createQueryBuilder('t')
    .where('t.tenantId = :tenantId', { tenantId })
    .orderBy('t.createdAt', 'DESC')
    .addOrderBy('t.id', 'DESC')
    .take(limit + 1);

  if (lastSeenId && lastSeenDate) {
    qb.andWhere(
      '(t.createdAt, t.id) < (:lastSeenDate, :lastSeenId)',
      { lastSeenDate, lastSeenId },
    );
  }

  const data = await qb.getMany();
  const hasMore = data.length > limit;

  return {
    data: hasMore ? data.slice(0, limit) : data,
    hasMore,
  };
}
```

---

## Memory Management

### Stream-Based Processing

```typescript
// src/common/services/export.service.ts
async streamFromStream<T>(
  res: Response,
  stream: Readable,
  filename: string,
  transform?: (row: T) => Record<string, unknown>,
): Promise<void> {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const parser = stream.pipe(csvParser());

  try {
    for await (const row of parser) {
      const transformedRow = transform ? transform(row as T) : row;
      const csvLine = json2csv(transformedRow);
      res.write(csvLine + '\n');
    }
  } finally {
    res.end();
  }
}

// Usage for large exports
async exportTransactionsToCSV(res: Response): Promise<void> {
  const tenantId = TenantContextService.getTenantId();

  const stream = await this.transactionRepository
    .createQueryBuilder('t')
    .where('t.tenantId = :tenantId', { tenantId })
    .orderBy('t.transactionDate', 'DESC')
    .stream();

  try {
    await this.exportService.streamFromStream(
      res,
      stream,
      `transactions-${new Date().toISOString().split('T')[0]}.csv`,
      (row) => ({
        id: row.t_id,
        type: row.t_type,
        amount: row.t_amount,
        currency: row.t_currency,
        category: row.t_category,
        transactionDate: row.t_transaction_date,
      }),
    );
  } finally {
    // Always clean up the stream
    const streamWithDestroy = stream as { destroy: () => Promise<void> };
    if (typeof streamWithDestroy.destroy === 'function') {
      await streamWithDestroy.destroy();
    }
  }
}
```

### Memory Leak Prevention

```typescript
// Avoid closures that capture large objects
// BAD
const largeData = await fetchLargeDataset();
setTimeout(() => {
  process(largeData); // largeData stays in memory until timeout
}, 60000);

// GOOD
const largeData = await fetchLargeDataset();
const processor = new DataProcessor(largeData);
setTimeout(async () => {
  await processor.process();
  processor.cleanup(); // Release memory
}, 60000);

// Use WeakMap/WeakSet for object-to-object mappings
const objectCache = new WeakMap<object, unknown>();
```

---

## Concurrency and Async Patterns

### Parallel Processing

```typescript
// src/common/utils/parallel.utils.ts
export async function parallelMap<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = 10,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  const worker = async () => {
    while (queue.length > 0) {
      const { item, index } = queue.shift()!;
      results[index] = await processor(item, index);
    }
  };

  const workers = Array(Math.min(concurrency, queue.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

// Usage: Process multiple reports in parallel
async function generateAllReports(tenantId: string): Promise<Report[]> {
  return parallelMap(
    ['pnl', 'budget', 'expenses', 'revenue'],
    async (reportType) => {
      return this.reportService.generateReport(tenantId, reportType);
    },
    4, // Process 4 reports concurrently
  );
}
```

### Promise Pool

```typescript
// src/common/utils/promise-pool.util.ts
export class PromisePool {
  private running = 0;
  private queue: Array<() => Promise<void>> = [];
  private results: Array<{
    status: 'fulfilled' | 'rejected';
    value: unknown;
    reason: unknown;
  }> = [];

  constructor(private readonly concurrency: number) {}

  async add<T>(
    task: () => Promise<T>,
  ): Promise<{ status: 'fulfilled' | 'rejected'; value: T; reason: unknown }> {
    return new Promise((resolve) => {
      const execute = async () => {
        this.running++;
        try {
          const value = await task();
          this.results.push({ status: 'fulfilled', value, reason: null });
          resolve({ status: 'fulfilled', value, reason: null });
        } catch (error) {
          this.results.push({ status: 'rejected', value: null, reason: error });
          resolve({ status: 'rejected', value: null, reason: error });
        } finally {
          this.running--;
          this.processQueue();
        }
      };

      if (this.running < this.concurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.running < this.concurrency) {
      const task = this.queue.shift()!;
      task();
    }
  }

  async waitAll(): Promise<typeof this.results> {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.results;
  }
}
```

### Circuit Breaker Pattern

```typescript
// src/common/resilience/circuit-breaker.ts
import CircuitBreaker from 'opossum';

export function CircuitBreakerPattern(
  timeout: number = 3000,
  errorThresholdPercentage: number = 50,
  resetTimeout: number = 30000,
) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    const breaker = new CircuitBreaker(originalMethod, {
      timeout,
      errorThresholdPercentage,
      resetTimeout,
    });

    breaker.on('open', () => {
      console.warn(`Circuit breaker OPEN for ${propertyKey}`);
    });

    breaker.on('close', () => {
      console.info(`Circuit breaker CLOSED for ${propertyKey}`);
    });

    descriptor.value = function (...args: unknown[]) {
      return breaker.fire.apply(this, args);
    };

    return descriptor;
  };
}

// Usage
class WebhookService {
  @CircuitBreakerPattern({ timeout: 5000, errorThresholdPercentage: 50 })
  async deliverWebhook(webhook: Webhook, payload: unknown): Promise<boolean> {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  }
}
```

---

## API Performance

### Response Compression

```typescript
// src/main.ts
import compression from 'compression';

app.use(
  compression({
    level: 6, // Compression level (0-9)
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Don't compress if client doesn't accept gzip
      return req.headers['accept-encoding']?.includes('gzip')
        ? compression.filter(req, res)
        : false;
    },
  }),
);
```

### Response Optimization

```typescript
// Use class-serializer for consistent response transformation
app.useGlobalInterceptors(
  new ClassSerializerInterceptor(app.get(Reflector), {
    excludeExtraneousValues: true, // Only serialize @Expose() fields
  }),
);

// Use DTOs for response shaping
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Exclude()
  passwordHash: string; // Will not be serialized
}
```

### Rate Limiting Impact

```typescript
// Configure rate limiting to balance security and performance
ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 1000, // 1 second
    limit: 10, // 10 requests per second
  },
  {
    name: 'medium',
    ttl: 10000, // 10 seconds
    limit: 100, // 100 requests per 10 seconds
  },
  {
    name: 'long',
    ttl: 60000, // 1 minute
    limit: 500, // 500 requests per minute
  },
]),
```

---

## Infrastructure Tuning

### Redis Configuration

```yaml
# redis.conf
maxmemory 1gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
tcp-keepalive 300
timeout 0
tcp-backlog 511
```

### PostgreSQL Configuration

```sql
-- postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 64MB
maintenance_work_mem = 256MB
random_page_cost = 1.1
effective_io_concurrency = 200
max_connections = 200
statement_timeout = 60000
log_min_duration_statement = 1000
log_lock_waits = on
log_temp_files = 0
```

### Docker Resource Limits

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  redis:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

---

## Monitoring and Profiling

### Performance Metrics

```typescript
// src/modules/metrics/metrics.service.ts
@Injectable()
export class MetricsService {
  private readonly requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'path', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  });

  private readonly dbQueryDuration = new Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of database queries',
    labelNames: ['query_type', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  });

  private readonly cacheHitRate = new Gauge({
    name: 'cache_hit_rate',
    help: 'Cache hit rate as a percentage',
    labelNames: ['cache_type'],
  });

  recordRequest(
    method: string,
    path: string,
    status: number,
    duration: number,
  ): void {
    this.requestDuration.observe({ method, path, status }, duration);
  }

  recordDbQuery(table: string, queryType: string, duration: number): void {
    this.dbQueryDuration.observe({ queryType, table }, duration);
  }

  async recordCacheMetrics(): Promise<void> {
    const hits = await this.cacheService.getCacheHits();
    const misses = await this.cacheService.getCacheMisses();
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    this.cacheHitRate.set({ cache_type: 'redis' }, hitRate);
  }
}
```

### Slow Query Logging

```typescript
// src/common/interceptors/performance.interceptor.ts
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly slowQueryThreshold = 1000; // 1 second

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap({
        complete: () => {
          const duration = Date.now() - start;

          if (duration > this.slowQueryThreshold) {
            this.logger.warn({
              message: 'Slow request detected',
              method: request.method,
              url: request.url,
              duration: `${duration}ms`,
            });
          }

          // Record metrics
          this.metricsService.recordRequest(
            request.method,
            request.url,
            context.switchToHttp().getResponse().statusCode,
            duration,
          );
        },
      }),
    );
  }
}
```

### Health Check Endpoints

```typescript
// src/modules/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  @Get('live')
  liveness(): { status: string } {
    return { status: 'OK' };
  }

  @Get('ready')
  async readiness(): Promise<HealthIndicatorResult> {
    const checks: HealthIndicatorResult = {};

    // Database check
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = this.getStatus('database', true);
    } catch (error) {
      checks.database = this.getStatus('database', false, {
        error: error.message,
      });
    }

    // Cache check
    try {
      await this.cacheService.get('health-check');
      checks.cache = this.getStatus('cache', true);
    } catch (error) {
      checks.cache = this.getStatus('cache', false, { error: error.message });
    }

    return checks;
  }

  private getStatus(
    key: string,
    isHealthy: boolean,
    details?: Record<string, unknown>,
  ): HealthIndicatorResult {
    return {
      key,
      status: isHealthy ? 'up' : 'down',
      ...details,
    };
  }
}
```

---

## Performance Budgets

### API Response Time Targets

| Endpoint Type          | P95 Target | P99 Target |
| ---------------------- | ---------- | ---------- |
| Authentication (login) | < 200ms    | < 500ms    |
| Read operations        | < 100ms    | < 200ms    |
| Write operations       | < 500ms    | < 1s       |
| Reports (async)        | < 5s       | < 10s      |
| File uploads           | < 2s       | < 5s       |

### Database Query Targets

| Query Type                   | Target                |
| ---------------------------- | --------------------- |
| Simple lookups by ID         | < 10ms                |
| List queries with pagination | < 50ms                |
| Aggregated reports           | < 500ms               |
| Complex analytics            | < 5s (consider async) |

### Resource Utilization Targets

| Resource             | Target        | Alert Threshold |
| -------------------- | ------------- | --------------- |
| CPU                  | < 70% average | > 80%           |
| Memory               | < 80%         | > 90%           |
| Database connections | < 70% pool    | > 90%           |
| Redis memory         | < 80%         | > 90%           |
| Disk I/O             | < 60%         | > 80%           |

---

## References

- [PostgreSQL Performance Tips](https://www.postgresql.org/docs/current/performance-tips.html)
- [Redis Performance](https://redis.io/docs/management/optimization/benchmarks/)
- [Node.js Performance](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)
- [NestJS Performance](https://docs.nestjs.com/fundamentals/application-context)

---

_Document Version: 1.0.0_  
_Last Updated: January 8, 2026_  
_Next Review: April 8, 2026_
