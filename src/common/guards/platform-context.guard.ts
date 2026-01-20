import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CONTEXT_TYPE_KEY } from '../decorators/context.decorator';
import { ContextType } from '../enums/context-type.enum';

interface PlatformUser {
  aud?: string;
  userId?: string;
  platformRole?: string;
}

/**
 * Guard to enforce context separation between tenant and platform operations
 */
@Injectable()
export class PlatformContextGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredContext = this.reflector.getAllAndOverride<ContextType>(CONTEXT_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredContext) {
      // If no context specified, default to tenant context
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: PlatformUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Check if JWT audience matches required context
    const jwtAudience = user.aud ?? 'tenant';

    if (requiredContext === ContextType.PLATFORM && jwtAudience !== 'platform') {
      throw new UnauthorizedException('Platform credentials required for this operation');
    }

    if (requiredContext === ContextType.TENANT && jwtAudience === 'platform') {
      throw new UnauthorizedException('Tenant credentials required for this operation');
    }

    return true;
  }
}
