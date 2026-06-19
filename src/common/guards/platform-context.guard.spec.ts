import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMockExecutionContext } from '../../../test/helpers/test-setup.utils';
import { ContextType } from '../enums/context-type.enum';
import { PlatformContextGuard } from './platform-context.guard';

describe('PlatformContextGuard', () => {
  let guard: PlatformContextGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PlatformContextGuard(reflector);
  });

  it('allows routes without explicit context requirement', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockExecutionContext({ request: { user: { aud: 'tenant' } } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('requires authentication when context is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ContextType.PLATFORM);

    const context = createMockExecutionContext({ request: { user: undefined } });

    expect(() => guard.canActivate(context)).toThrow(new UnauthorizedException('common.authentication_required'));
  });

  it('rejects tenant JWT on platform routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ContextType.PLATFORM);

    const context = createMockExecutionContext({ request: { user: { aud: 'tenant' } } });

    expect(() => guard.canActivate(context)).toThrow(new UnauthorizedException('auth.platform_credentials_required'));
  });

  it('rejects platform JWT on tenant routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ContextType.TENANT);

    const context = createMockExecutionContext({ request: { user: { aud: 'platform' } } });

    expect(() => guard.canActivate(context)).toThrow(new UnauthorizedException('auth.tenant_credentials_required'));
  });

  it('allows matching platform JWT on platform routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ContextType.PLATFORM);

    const context = createMockExecutionContext({ request: { user: { aud: 'platform' } } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('defaults missing aud to tenant audience', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(ContextType.TENANT);

    const context = createMockExecutionContext({ request: { user: { userId: 'u1' } } });

    expect(guard.canActivate(context)).toBe(true);
  });
});
