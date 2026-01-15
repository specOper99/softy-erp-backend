import { ForbiddenException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  private readonly enabled: boolean;
  private readonly excludedPaths: string[];
  private readonly doubleCsrfProtection: ReturnType<typeof doubleCsrf>['doubleCsrfProtection'];
  private readonly generateCsrfToken: ReturnType<typeof doubleCsrf>['generateCsrfToken'];

  constructor(private readonly configService: ConfigService) {
    const enabled = this.configService.get<boolean>('CSRF_ENABLED', true);
    this.enabled = String(enabled) !== 'false';
    this.excludedPaths = ['/api/v1/webhooks', '/api/v1/billing/webhooks', '/api/v1/health', '/api/v1/metrics'];

    const isProd = this.configService.get('NODE_ENV') === 'production';
    const secret = this.configService.get<string>('CSRF_SECRET');

    // SECURITY: Enforce strong CSRF secret in production
    if (isProd && this.enabled) {
      if (!secret || secret.length < 32) {
        throw new Error('CSRF_SECRET must be set and at least 32 characters in production when CSRF is enabled');
      }
      if (secret === 'csrf-secret-change-in-production') {
        throw new Error('CSRF_SECRET must be changed from the default value in production');
      }
    }

    // Use provided secret or fallback for development only
    const effectiveSecret = secret || 'csrf-secret-change-in-production';

    const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
      getSecret: () => effectiveSecret,
      getSessionIdentifier: (req: Request) => {
        // SECURITY FIX: Don't use raw Authorization header to prevent token leakage
        // Priority: 1. Tenant ID, 2. Session cookie, 3. Hashed IP + truncated UA
        const tenantId = TenantContextService.getTenantId();
        if (tenantId) return tenantId;

        const sessionId = (req.cookies as Record<string, string>)?.['session_id'];
        if (sessionId) return sessionId;

        // Fallback: hash IP + truncated user-agent for stable identifier
        const ip = req.ip || 'unknown';
        const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 200);
        return createHash('sha256').update(`${ip}:${ua}`).digest('hex');
      },
      cookieName: '_csrf',
      cookieOptions: {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProd,
        path: '/',
      },
      getCsrfTokenFromRequest: (req: Request) =>
        (req.headers['x-csrf-token'] as string) ||
        (req.headers['x-xsrf-token'] as string) ||
        (req.body as { _csrf?: string })?._csrf,
    });

    this.doubleCsrfProtection = doubleCsrfProtection;
    this.generateCsrfToken = generateCsrfToken;
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.enabled) {
      return next();
    }

    if (this.shouldSkip(req)) {
      return next();
    }

    if (this.isApiRequest(req)) {
      return next();
    }

    if (req.method === 'GET') {
      try {
        const token = this.generateCsrfToken(req, res);
        res.cookie('XSRF-TOKEN', token, {
          httpOnly: false,
          sameSite: 'strict',
          secure: this.configService.get('NODE_ENV') === 'production',
        });
      } catch {
        // First request may not have session, continue
      }
      return next();
    }

    try {
      this.doubleCsrfProtection(req, res, (err: unknown) => {
        if (err) {
          this.logger.warn(`CSRF token validation failed for ${req.path}`);
          throw new ForbiddenException('Invalid CSRF token');
        }
        next();
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.warn(
        `CSRF validation error for ${req.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ForbiddenException('Invalid CSRF token');
    }
  }

  private shouldSkip(req: Request): boolean {
    const path = req.path;
    return this.excludedPaths.some((excluded) => path.startsWith(excluded));
  }

  private isApiRequest(req: Request): boolean {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];
    return !!(authHeader?.startsWith('Bearer ') || apiKeyHeader);
  }
}
