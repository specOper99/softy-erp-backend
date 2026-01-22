import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  // Provide consistent, sanitized auth errors and logging.
  // Note: do NOT log token contents.
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      this.logger.warn(`JWT auth error: ${message}`);
      throw err instanceof Error ? err : new UnauthorizedException('Unauthorized');
    }

    if (!user) {
      // Passport info objects often contain token parsing details; keep message generic.
      const reason = info && typeof info === 'object' ? (info as { message?: string }).message : undefined;
      if (reason) {
        this.logger.debug(`JWT auth denied: ${reason}`);
      }
      throw new UnauthorizedException('Unauthorized');
    }

    return user;
  }
}
