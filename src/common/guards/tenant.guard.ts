import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContextService } from '../services/tenant-context.service';

/**
 * Global guard that ensures a tenant context is present for protected routes.
 * It checks the TenantContextService (populated by TenantMiddleware) for a tenantId.
 * Certain public routes (e.g., user registration) are allowed without a tenant ID.
 * If no tenantId is found for protected routes, the request is rejected with an UnauthorizedException.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request?.path ?? '';
    const method = request?.method?.toUpperCase() ?? '';

    // Allow registration endpoint without tenant header
    if (method === 'POST' && path === '/api/v1/auth/register') {
      return true;
    }

    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      // No tenant information – reject the request.
      throw new UnauthorizedException('Tenant ID is required');
    }
    return true;
  }
}
