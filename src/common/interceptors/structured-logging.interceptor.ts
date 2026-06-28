import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { getCorrelationId } from '../logger/request-context';
import { TenantContextService } from '../services/tenant-context.service';
import { getClientIp } from '../utils/client-ip.util';
import { LogSanitizer } from '../utils/log-sanitizer.util';

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
  body?: unknown;
}

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly trustProxyHeaders: boolean;

  constructor(private readonly configService: ConfigService) {
    this.trustProxyHeaders = this.configService.get<string>('TRUST_PROXY') === 'true';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const correlationIdHeader = request.headers['x-correlation-id'];
    const correlationIdFromHeader = Array.isArray(correlationIdHeader) ? correlationIdHeader[0] : correlationIdHeader;
    const correlationId =
      getCorrelationId() ?? (typeof correlationIdFromHeader === 'string' ? correlationIdFromHeader : undefined);

    const logContext: LogContext = {
      correlationId,
      tenantId: TenantContextService.getTenantId(),
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: getClientIp(request, this.trustProxyHeaders, (message) => this.logger.warn(message)) ?? undefined,
    };

    const body = request.body as Record<string, unknown>;
    if (request.method !== 'GET' && body && Object.keys(body).length > 0) {
      logContext.body = LogSanitizer.sanitize(body);
    }

    const reqWithUser = request as { user?: { sub?: string } };
    if (reqWithUser.user?.sub) logContext.userId = reqWithUser.user.sub;

    return next.handle().pipe(
      tap({
        next: () => {
          logContext.statusCode = response.statusCode;
          logContext.duration = Date.now() - startTime;
          this.logRequest(logContext);
        },
        error: (error: unknown) => {
          const status =
            error && typeof error === 'object' && 'status' in error ? (error as { status: number }).status : 500;
          logContext.statusCode = status;
          logContext.duration = Date.now() - startTime;
          this.logRequest(logContext, error instanceof Error ? error : new Error(String(error)));
        },
      }),
    );
  }

  private logRequest(context: LogContext, error?: Error): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: error ? 'error' : 'info',
      ...context,
      ...(error && { error: { name: error.name, message: error.message } }),
    };

    const payload = JSON.stringify(logEntry);
    if (error) this.logger.error(payload);
    else if (context.duration && context.duration > 1000) this.logger.warn(payload);
    else this.logger.log(payload);
  }
}
