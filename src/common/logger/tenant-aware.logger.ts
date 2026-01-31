import { Injectable, Logger, Scope } from '@nestjs/common';
import { TenantContextService } from '../services/tenant-context.service';
import { getCorrelationId, getRequestContext } from './request-context';

/**
 * TenantAwareLogger
 *
 * A custom logger that automatically includes tenant context in all log messages.
 * This ensures observability and traceability across multi-tenant operations.
 *
 * Features:
 * - Automatic tenantId injection from TenantContextService
 * - Correlation ID injection from request context
 * - User ID injection when available
 * - Structured logging with JSON metadata
 * - Compatible with NestJS logging infrastructure
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   private readonly logger = new TenantAwareLogger('MyService');
 *
 *   doSomething() {
 *     this.logger.log('Operation completed', { orderId: '123' });
 *     // Output: [MyService] Operation completed {"tenantId":"tenant-1","correlationId":"abc","orderId":"123"}
 *   }
 * }
 * ```
 */
@Injectable({ scope: Scope.TRANSIENT })
export class TenantAwareLogger extends Logger {
  constructor(context = 'Application') {
    super(context);
  }

  /**
   * Build context metadata including tenant, correlation ID, and user
   */
  private buildContextMeta(): Record<string, string | undefined> {
    const tenantId = TenantContextService.getTenantId();
    const correlationId = getCorrelationId();
    const requestContext = getRequestContext();

    return {
      tenantId,
      correlationId,
      userId: requestContext?.userId,
    };
  }

  /**
   * Format message with context metadata
   */
  private formatWithContext(message: string, meta?: Record<string, unknown>): string {
    const contextMeta = this.buildContextMeta();
    const combinedMeta = { ...contextMeta, ...meta };

    // Remove undefined values
    const cleanMeta = Object.fromEntries(Object.entries(combinedMeta).filter(([, v]) => v !== undefined));

    if (Object.keys(cleanMeta).length === 0) {
      return message;
    }

    return `${message} ${JSON.stringify(cleanMeta)}`;
  }

  /**
   * Log a message at the 'log' level with tenant context
   */
  override log(message: string, meta?: Record<string, unknown>): void;
  override log(message: string, context?: string): void;
  override log(message: string, metaOrContext?: Record<string, unknown> | string): void {
    if (typeof metaOrContext === 'string') {
      super.log(this.formatWithContext(message), metaOrContext);
    } else {
      super.log(this.formatWithContext(message, metaOrContext));
    }
  }

  /**
   * Log a message at the 'error' level with tenant context
   */
  override error(message: string, trace?: string, context?: string): void;
  override error(message: string, meta?: Record<string, unknown>): void;
  override error(message: string, traceOrMeta?: string | Record<string, unknown>, context?: string): void {
    if (typeof traceOrMeta === 'object') {
      super.error(this.formatWithContext(message, traceOrMeta));
    } else {
      super.error(this.formatWithContext(message), traceOrMeta, context);
    }
  }

  /**
   * Log a message at the 'warn' level with tenant context
   */
  override warn(message: string, meta?: Record<string, unknown>): void;
  override warn(message: string, context?: string): void;
  override warn(message: string, metaOrContext?: Record<string, unknown> | string): void {
    if (typeof metaOrContext === 'string') {
      super.warn(this.formatWithContext(message), metaOrContext);
    } else {
      super.warn(this.formatWithContext(message, metaOrContext));
    }
  }

  /**
   * Log a message at the 'debug' level with tenant context
   */
  override debug(message: string, meta?: Record<string, unknown>): void;
  override debug(message: string, context?: string): void;
  override debug(message: string, metaOrContext?: Record<string, unknown> | string): void {
    if (typeof metaOrContext === 'string') {
      super.debug(this.formatWithContext(message), metaOrContext);
    } else {
      super.debug(this.formatWithContext(message, metaOrContext));
    }
  }

  /**
   * Log a message at the 'verbose' level with tenant context
   */
  override verbose(message: string, meta?: Record<string, unknown>): void;
  override verbose(message: string, context?: string): void;
  override verbose(message: string, metaOrContext?: Record<string, unknown> | string): void {
    if (typeof metaOrContext === 'string') {
      super.verbose(this.formatWithContext(message), metaOrContext);
    } else {
      super.verbose(this.formatWithContext(message, metaOrContext));
    }
  }

  /**
   * Log an audit event with full tenant context.
   * Use this for security-sensitive operations.
   */
  audit(action: string, details: Record<string, unknown>): void {
    const meta = {
      ...this.buildContextMeta(),
      action,
      ...details,
      timestamp: new Date().toISOString(),
      level: 'AUDIT' as const,
    };

    super.log(`[AUDIT] ${action} ${JSON.stringify(meta)}`);
  }

  /**
   * Log a tenant isolation event (cross-tenant access attempt, etc.)
   * These should trigger alerts in production.
   */
  tenantSecurityEvent(
    eventType: 'ACCESS_DENIED' | 'MISMATCH_DETECTED' | 'CONTEXT_MISSING',
    details: Record<string, unknown>,
  ): void {
    const meta = {
      ...this.buildContextMeta(),
      eventType,
      ...details,
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL' as const,
    };

    super.error(`[TENANT_SECURITY] ${eventType} ${JSON.stringify(meta)}`);
  }
}

/**
 * Factory function to create a TenantAwareLogger with a specific context
 */
export function createTenantLogger(context: string): TenantAwareLogger {
  return new TenantAwareLogger(context);
}
