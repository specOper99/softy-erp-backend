import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { toErrorMessage } from '../../../common/utils/error.util';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  // Provide consistent, sanitized auth errors and logging.
  // Note: do NOT log token contents.
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err) {
      const message = toErrorMessage(err);
      this.logger.warn(`JWT auth error: ${message}`);
      throw err instanceof Error ? err : new UnauthorizedException('common.unauthorized_plain');
    }

    if (!user) {
      // Passport info objects often contain token parsing details; keep message generic.
      const reason = info && typeof info === 'object' ? (info as { message?: string }).message : undefined;
      if (reason) {
        this.logger.debug(`JWT auth denied: ${reason}`);
      }
      throw new UnauthorizedException('common.unauthorized_plain');
    }

    return user;
  }
}
