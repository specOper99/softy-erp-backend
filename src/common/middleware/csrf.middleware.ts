import { ForbiddenException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { doubleCsrf } from 'csrf-csrf';
import { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
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
    // CSRF is only meaningful for cookie-authenticated flows.
    // This service primarily uses Bearer tokens; exclude auth endpoints to avoid coupling login/refresh to CSRF.
    this.excludedPaths = [
      '/api/v1/webhooks',
      '/api/v1/billing/webhooks',
      '/api/v1/health',
      '/api/v1/metrics',
      '/api/v1/auth',
      '/api/v1/platform/auth',
      '/api/v1/platform/mfa',
    ];

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

    // Production hardening: use __Host- prefix for CSRF cookie
    // This provides additional security by ensuring the cookie cannot be set by subdomains
    // and must have Secure, Path=/, and no Domain attribute
    const csrfCookieName = isProd ? '__Host-csrf' : '_csrf';

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
      cookieName: csrfCookieName,
      cookieOptions: {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProd,
        path: '/',
      },
      getCsrfTokenFromRequest: (req: Request) => {
        const token =
          (req.headers['x-csrf-token'] as string) ||
          (req.headers['x-xsrf-token'] as string) ||
          (req.body as { _csrf?: string })?._csrf;
        // Reject non-string tokens for security
        if (typeof token !== 'string' || token.length === 0) {
          return undefined;
        }
        return token;
      },
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
          path: '/',
        });
      } catch (tokenError) {
        this.logger.warn(
          `CSRF token generation failed for ${req.path}: ${tokenError instanceof Error ? tokenError.message : 'no session'}`,
        );

        try {
          const token = this.generateCsrfToken(req, res, { overwrite: true });
          res.cookie('XSRF-TOKEN', token, {
            httpOnly: false,
            sameSite: 'strict',
            secure: this.configService.get('NODE_ENV') === 'production',
            path: '/',
          });
        } catch (retryError) {
          this.logger.warn(
            `CSRF token generation retry failed for ${req.path}: ${retryError instanceof Error ? retryError.message : 'unknown'}`,
          );

          if (this.configService.get('NODE_ENV') === 'production') {
            throw new ServiceUnavailableException('CSRF token unavailable');
          }
        }
      }
      return next();
    }

    // CSRF is a cookie problem. If the request is not carrying cookies, there's nothing for CSRF to protect.
    // This keeps public endpoints (and bearer-only setups) working without requiring CSRF coordination.
    if (!req.headers.cookie) {
      return next();
    }

    // Defense-in-depth: block cross-site browser requests using Fetch Metadata.
    // This does not replace CSRF token validation; it reduces exposure for browsers that support it.
    const fetchSiteHeader = req.headers['sec-fetch-site'];
    const fetchSite = Array.isArray(fetchSiteHeader) ? fetchSiteHeader[0] : fetchSiteHeader;
    if (fetchSite === 'cross-site') {
      throw new ForbiddenException('Invalid CSRF token');
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
    const clientTokenHeader = req.headers['x-client-token'];

    return !!(authHeader?.startsWith('Bearer ') || apiKeyHeader || clientTokenHeader);
  }
}
