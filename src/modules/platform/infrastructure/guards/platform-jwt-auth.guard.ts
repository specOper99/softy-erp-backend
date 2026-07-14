import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { toErrorMessage } from '../../../../common/utils/error.util';

@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard('platform-jwt') {
  private readonly logger = new Logger(PlatformJwtAuthGuard.name);

  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err) {
      const message = toErrorMessage(err);
      this.logger.warn(`Platform JWT auth error: ${message}`);
      throw err instanceof Error ? err : new UnauthorizedException('common.unauthorized_plain');
    }

    if (!user) {
      const reason = info && typeof info === 'object' ? (info as { message?: string }).message : undefined;
      if (reason) this.logger.debug(`Platform JWT auth denied: ${reason}`);
      throw new UnauthorizedException('common.unauthorized_plain');
    }

    return user;
  }
}
