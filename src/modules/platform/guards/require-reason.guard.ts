import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_REASON_KEY } from '../decorators/require-reason.decorator';

interface RequestWithReason {
  body?: { reason?: string };
  query?: { reason?: string };
  validatedReason?: string;
}

/**
 * Guard to enforce reason requirement for sensitive operations
 */
@Injectable()
export class RequireReasonGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireReason = this.reflector.getAllAndOverride<boolean>(REQUIRE_REASON_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requireReason) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithReason>();
    const reason = request.body?.reason ?? request.query?.reason;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      throw new BadRequestException('A detailed reason (minimum 10 characters) is required for this operation');
    }

    // Attach validated reason to request for use in service layer
    request.validatedReason = reason.trim();

    return true;
  }
}
