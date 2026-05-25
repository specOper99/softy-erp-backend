import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockContext = {} as ExecutionContext;

describe('JwtAuthGuard', () => {
  it('returns user when present', () => {
    const guard = new JwtAuthGuard();
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user, undefined, mockContext)).toBe(user);
  });

  it('throws UnauthorizedException when user missing', () => {
    const guard = new JwtAuthGuard();
    expect(() => guard.handleRequest(null, null, undefined, mockContext)).toThrow(UnauthorizedException);
  });

  it('rethrows err when provided', () => {
    const guard = new JwtAuthGuard();
    const err = new Error('boom');
    expect(() => guard.handleRequest(err, { id: 'u1' }, undefined, mockContext)).toThrow('boom');
  });
});
