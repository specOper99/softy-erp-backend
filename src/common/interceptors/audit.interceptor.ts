import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_KEY, AuditOptions } from '../decorators/audit.decorator';

interface User {
  sub?: string;
  userId?: string;
  [key: string]: any;
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
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditOptions>(
      AUDIT_KEY,
      context.getHandler(),
    );

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
          void this.logAuditEvent(
            auditOptions,
            request,
            user,
            'SUCCESS',
            Date.now() - startTime,
            auditOptions.includeResponse ? response : undefined,
          );
        },
        error: (error) => {
          void this.logAuditEvent(
            auditOptions,
            request,
            user,
            'FAILURE',
            Date.now() - startTime,
            undefined,
            (error as Error).message,
          );
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
    response?: any,
    error?: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const auditData: AuditLogData = {
      action: options.action,
      resource: options.resource,
      userId: user?.sub || 'anonymous',
      tenantId: request.headers['x-tenant-id'] as string,
      correlationId: request.headers['x-correlation-id'] as string,
      method: request.method,
      path: request.path,
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'],
      status,
      durationMs,
      ...(options.includeBody && {
        requestBody: this.sanitizeBody(request.body) as unknown,
      }),
      ...(response && { responseData: response as unknown }),
      ...(error && { error }),
      timestamp: new Date().toISOString(),
    };

    // Log to audit service (database)
    try {
      await this.auditService.log({
        userId: auditData.userId,
        action: `${options.action}_${options.resource.toUpperCase()}`,
        entityName: options.resource,
        entityId: request.params?.id || 'N/A',
        newValues: auditData,
        notes: error || undefined,
      });
    } catch (e) {
      // Swallow audit errors to not affect main flow
      console.error('Audit logging failed:', e);
    }
  }

  private sanitizeBody(body: any): any {
    if (!body) return undefined;
    const sanitized = { ...body } as Record<string, any>;
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.currentPassword;
    delete sanitized.newPassword;
    delete sanitized.token;
    delete sanitized.refreshToken;
    return sanitized;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || 'unknown';
  }
}
