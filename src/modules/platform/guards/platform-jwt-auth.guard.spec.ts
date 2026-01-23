import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformJwtAuthGuard } from './platform-jwt-auth.guard';

describe('PlatformJwtAuthGuard', () => {
  it('returns user when present', () => {
    const guard = new PlatformJwtAuthGuard(new Reflector());
    const user = {
      id: 'u1',
      email: 'u1@example.com',
      platformRole: 'admin',
      sessionId: 's1',
      userId: 'u1',
      aud: 'platform' as const,
    };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('throws UnauthorizedException when user missing', () => {
    const guard = new PlatformJwtAuthGuard(new Reflector());
    expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedException);
  });

  it('rethrows err when provided', () => {
    const guard = new PlatformJwtAuthGuard(new Reflector());
    const err = new Error('boom');
    const user = {
      id: 'u1',
      email: 'u1@example.com',
      platformRole: 'admin',
      sessionId: 's1',
      userId: 'u1',
      aud: 'platform' as const,
    };
    expect(() => guard.handleRequest(err, user)).toThrow('boom');
  });
});
