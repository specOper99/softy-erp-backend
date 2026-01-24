import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_KEY, AuditOptions } from '../decorators/audit.decorator';
import { getCorrelationId } from '../logger/request-context';
import { TenantContextService } from '../services/tenant-context.service';
import { getClientIp } from '../utils/client-ip.util';

interface User {
  sub?: string;
  userId?: string;
  [key: string]: unknown;
}

interface AuditLogData {
  action: string;
  resource: string;
  userId: string;
  tenantId: string;
  correlationId: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  durationMs: number;
  requestBody?: unknown;
  responseData?: unknown;
  error?: string;
  timestamp: string;
}

/**
 * Interceptor that automatically logs audit events for endpoints
 * decorated with @Audit(). Creates a systematic audit trail.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  private readonly trustProxyHeaders: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.trustProxyHeaders = this.configService.get<string>('TRUST_PROXY') === 'true';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions = this.reflector.get<AuditOptions>(AUDIT_KEY, context.getHandler());

    // Skip if endpoint is not decorated with @Audit
    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user: User }).user;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (response) => {
          this.logAuditEvent(
            auditOptions,
            request,
            user,
            'SUCCESS',
            Date.now() - startTime,
            auditOptions.includeResponse ? response : undefined,
          ).catch((e) => {
            this.logger.error('AuditInterceptor logAuditEvent failed', e instanceof Error ? e.stack : String(e));
          });
        },
        error: (error) => {
          this.logAuditEvent(
            auditOptions,
            request,
            user,
            'FAILURE',
            Date.now() - startTime,
            undefined,
            error instanceof Error ? error.message : String(error),
          ).catch((e) => {
            this.logger.error('AuditInterceptor logAuditEvent failed', e instanceof Error ? e.stack : String(e));
          });
        },
      }),
    );
  }

  private async logAuditEvent(
    options: AuditOptions,
    request: Request,
    user: User,
    status: 'SUCCESS' | 'FAILURE',
    durationMs: number,
    response?: unknown,
    error?: string,
  ): Promise<void> {
    const auditData: AuditLogData = {
      action: options.action,
      resource: options.resource,
      userId: user?.sub || 'anonymous',
      tenantId: TenantContextService.getTenantId() || 'N/A',
      correlationId: getCorrelationId() ?? (request.headers['x-correlation-id'] as string | undefined) ?? 'N/A',
      method: request.method,
      path: request.path,
      ip: getClientIp(request, this.trustProxyHeaders, (message) => this.logger.warn(message)),
      userAgent: request.headers['user-agent'],
      status,
      durationMs,
      ...(options.includeBody && typeof request.body === 'object' && request.body !== null
        ? { requestBody: this.sanitizeData(request.body) }
        : {}),
      ...(options.includeResponse && response !== undefined ? { responseData: this.sanitizeData(response) } : {}),
      ...(error ? { error } : {}),
      timestamp: new Date().toISOString(),
    };

    // Log to audit service (database)
    try {
      const paramId = request.params?.id;
      const entityId = Array.isArray(paramId) ? (paramId[0] ?? 'N/A') : (paramId ?? 'N/A');

      await this.auditService.log({
        userId: auditData.userId,
        action: `${options.action}_${options.resource.toUpperCase()}`,
        entityName: options.resource,
        entityId,
        notes: error || undefined,
        ipAddress: auditData.ip,
        userAgent: auditData.userAgent,
        method: auditData.method,
        path: auditData.path,
        statusCode: status === 'SUCCESS' ? 200 : 500, // Approximate. Ideally get real status.
        durationMs: auditData.durationMs,
      });
    } catch (e) {
      this.logger.error('Audit logging failed', e instanceof Error ? e.stack : String(e));
    }
  }

  private sanitizeData(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    const sanitized = { ...data } as Record<string, unknown>;
    const sensitiveKeys = [
      'password',
      'currentPassword',
      'newPassword',
      'token',
      'refreshToken',
      'accessToken',
      'secret',
      'clientSecret',
      'apiKey',
      'authorization',
    ];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  // getClientIp implemented in common util
}
