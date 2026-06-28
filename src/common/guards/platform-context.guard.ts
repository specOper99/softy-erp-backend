import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CONTEXT_TYPE_KEY } from '../decorators/context.decorator';
import { ContextType } from '../enums/context-type.enum';

interface PlatformUser {
  aud?: string;
}

@Injectable()
export class PlatformContextGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredContext = this.reflector.getAllAndOverride<ContextType>(CONTEXT_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredContext) return true;

    const user = context.switchToHttp().getRequest<{ user?: PlatformUser }>().user;
    if (!user) throw new UnauthorizedException('common.authentication_required');

    const jwtAudience = user.aud ?? 'tenant';
    if (requiredContext === ContextType.PLATFORM && jwtAudience !== 'platform') {
      throw new UnauthorizedException('auth.platform_credentials_required');
    }
    if (requiredContext === ContextType.TENANT && jwtAudience === 'platform') {
      throw new UnauthorizedException('auth.tenant_credentials_required');
    }
    return true;
  }
}
