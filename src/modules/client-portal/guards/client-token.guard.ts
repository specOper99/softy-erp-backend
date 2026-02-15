import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Client } from '../../bookings/entities/client.entity';
import { ClientAuthService } from '../services/client-auth.service';

/**
 * Guard to validate client token from header for client portal authentication.
 * Ensures the x-client-token header is present in protected routes.
 */
@Injectable()
export class ClientTokenGuard implements CanActivate {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-client-token'];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('client-portal.token_required');
    }
    const client = await this.clientAuthService.validateClientToken(token);
    if (!client) {
      throw new UnauthorizedException('client-portal.token_invalid');
    }
    (request as Request & { client?: Client }).client = client;
    return true;
  }
}
