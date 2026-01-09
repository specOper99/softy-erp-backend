import { Logger } from '@nestjs/common';
import { QueryRunner, Logger as TypeOrmLogger } from 'typeorm';

/**
 * Custom TypeORM query logger that logs slow queries and sanitizes sensitive data.
 * Queries taking longer than SLOW_QUERY_THRESHOLD_MS are logged at WARN level.
 */
export class QueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('TypeORM');
  private readonly slowQueryThresholdMs: number;

  constructor(slowQueryThresholdMs = 100) {
    this.slowQueryThresholdMs = slowQueryThresholdMs;
  }

  logQuery(
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const sanitizedParams = this.sanitizeParameters(parameters);
    this.logger.debug(`Query: ${query}`, { parameters: sanitizedParams });
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const sanitizedParams = this.sanitizeParameters(parameters);
    const errorMessage = error instanceof Error ? error.message : error;
    this.logger.error(`Query failed: ${query}`, {
      error: errorMessage,
      parameters: sanitizedParams,
    });
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const sanitizedParams = this.sanitizeParameters(parameters);
    if (time >= this.slowQueryThresholdMs) {
      this.logger.warn(`Slow query (${time}ms): ${query}`, {
        executionTime: time,
        parameters: sanitizedParams,
      });
    }
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log(`Schema: ${message}`);
  }

  logMigration(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log(`Migration: ${message}`);
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    _queryRunner?: QueryRunner,
  ): void {
    switch (level) {
      case 'log':
      case 'info':
        this.logger.log(String(message));
        break;
      case 'warn':
        this.logger.warn(String(message));
        break;
    }
  }

  /**
   * Sanitize query parameters to remove sensitive data like passwords and tokens.
   */
  private sanitizeParameters(parameters?: unknown[]): unknown[] | undefined {
    if (!parameters) return undefined;

    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /auth/i,
      /bearer/i,
    ];

    return parameters.map((param, index) => {
      if (typeof param === 'string') {
        // Check if the parameter looks like sensitive data
        for (const pattern of sensitivePatterns) {
          if (pattern.test(String(index)) || param.length > 50) {
            return '[REDACTED]';
          }
        }
        // Redact long strings that might be tokens
        if (param.length > 100) {
          return `[REDACTED:${param.length}chars]`;
        }
      }
      return param;
    });
  }
}
