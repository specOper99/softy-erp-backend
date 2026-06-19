import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PlatformJwtAuthGuard } from './platform-jwt-auth.guard';

describe('PlatformJwtAuthGuard', () => {
  let guard: PlatformJwtAuthGuard;
  const context = {} as ExecutionContext;

  beforeEach(() => {
    guard = new PlatformJwtAuthGuard();
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(guard['logger'], 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns authenticated platform user', () => {
    const user = { userId: 'admin-1', aud: 'platform' };

    expect(guard.handleRequest(null, user, null, context)).toEqual(user);
  });

  it('rethrows auth errors after logging', () => {
    const error = new UnauthorizedException('token expired');

    expect(() => guard.handleRequest(error, false, null, context)).toThrow(error);
  });

  it('throws unauthorized when user is missing', () => {
    expect(() => guard.handleRequest(null, false, { message: 'jwt expired' }, context)).toThrow(
      new UnauthorizedException('common.unauthorized_plain'),
    );
  });
});
