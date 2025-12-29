import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../services/tenant-context.service';

/**
 * Global guard that ensures a tenant context is present for protected routes.
 * It checks the TenantContextService (populated by TenantMiddleware) for a tenantId.
 * If no tenantId is found, the request is rejected with a ForbiddenException.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(
    _context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      // No tenant information – reject the request.
      throw new ForbiddenException('Tenant ID is required');
    }
    return true;
  }
}
