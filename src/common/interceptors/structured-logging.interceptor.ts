import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { TenantContextService } from '../services/tenant-context.service';

interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  method: string;
  url: string;
  statusCode?: number;
  duration?: number;
  userAgent?: string;
  ip?: string;
}

/**
 * Structured JSON logging interceptor.
 * Logs all HTTP requests/responses in JSON format with correlation IDs.
 * Integrates with the CorrelationIdMiddleware for request tracing.
 */
@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const correlationIdHeader = request.headers['x-correlation-id'];
    const correlationId = Array.isArray(correlationIdHeader)
      ? correlationIdHeader[0]
      : correlationIdHeader;

    const logContext: LogContext = {
      correlationId,
      tenantId: TenantContextService.getTenantId(),
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: this.getClientIp(request),
    };

    // Extract user ID from JWT if available
    // Safe access to user property which might be added by middleware
    const reqWithUser = request as { user?: { sub?: string } };
    if (reqWithUser.user?.sub) {
      logContext.userId = reqWithUser.user.sub;
    }

    return next.handle().pipe(
      tap({
        next: () => {
          logContext.statusCode = response.statusCode;
          logContext.duration = Date.now() - startTime;
          this.logRequest(logContext);
        },
        error: (error: unknown) => {
          const status =
            error && typeof error === 'object' && 'status' in error
              ? (error as { status: number }).status
              : 500;
          logContext.statusCode = status;
          logContext.duration = Date.now() - startTime;
          this.logRequest(
            logContext,
            error instanceof Error ? error : new Error(String(error)),
          );
        },
      }),
    );
  }

  private logRequest(context: LogContext, error?: Error): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: error ? 'error' : 'info',
      ...context,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
        },
      }),
    };

    // Output as JSON for log aggregators (ELK, CloudWatch, etc.)
    if (error) {
      this.logger.error(JSON.stringify(logEntry));
    } else if (context.duration && context.duration > 1000) {
      // Warn for slow requests
      this.logger.warn(JSON.stringify(logEntry));
    } else {
      this.logger.log(JSON.stringify(logEntry));
    }
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
