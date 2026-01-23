import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

export interface PlatformJwtUser {
  id: string;
  email: string;
  platformRole: string;
  sessionId: string;
  userId: string;
  aud: 'platform';
}

@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard('platform-jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser extends PlatformJwtUser = PlatformJwtUser>(
    err: unknown,
    user: TUser | false,
    _info?: unknown,
    _context?: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err) {
      throw err instanceof Error ? err : new UnauthorizedException('Invalid platform token');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid platform token');
    }

    return user;
  }
}
