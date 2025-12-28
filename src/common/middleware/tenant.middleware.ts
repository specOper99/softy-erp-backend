import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 1. Try to get tenantId from Header (e.g., from Gateway/Frontend)
    const tenantIdHeader = req.headers['x-tenant-id'] as string;

    // 2. Alternatively, if we decode JWT here we could use it,
    // but often AuthGuard runs AFTER Middleware.
    // For now, we rely on the header or we will enhance this later to Peek at JWT.

    // NOTE: In a strict environment, we might Block request if no tenantId found.
    // For Public APIs (login/register), we might allow missing tenantId or handle specific logic.
    // We will assume that if tenantId is missing, it might be a public route or User will provide it.

    // However, the prompt says "Extraction: Extract the tenantId from the JWT Payload ... OR the X-Tenant-ID header."

    // If we assume JWT is present in Authorization header: Bearer <token>
    // We could decode it without verifying signature just to get metadata,
    // but the Guard will verify it later.

    const tenantId = tenantIdHeader;

    if (!tenantId) {
      // Fallback or Public Route
      // We do not block here yet, but we set the context if available.
      return next();
    }

    TenantContextService.run(tenantId, () => {
      next();
    });
  }
}
