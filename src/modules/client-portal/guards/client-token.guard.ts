import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Guard to validate client token from header for client portal authentication.
 * Ensures the x-client-token header is present in protected routes.
 */
@Injectable()
export class ClientTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-client-token'];
    if (!token) {
      throw new UnauthorizedException('client-portal.token_required');
    }
    return true;
  }
}
