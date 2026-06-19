import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMockExecutionContext } from '../../../../test/helpers/test-setup.utils';
import { RequireReasonGuard } from './require-reason.guard';

describe('RequireReasonGuard', () => {
  let guard: RequireReasonGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RequireReasonGuard(reflector);
  });

  it('allows routes without require-reason metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    expect(guard.canActivate(createMockExecutionContext())).toBe(true);
  });

  it('accepts a valid reason from the request body', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context = createMockExecutionContext({
      request: { body: { reason: '  Compliance review ticket 12345  ' } },
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(context.switchToHttp().getRequest().validatedReason).toBe('Compliance review ticket 12345');
  });

  it('accepts a valid reason from the query string', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context = createMockExecutionContext({
      request: { query: { reason: 'Security incident response' } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects missing or too-short reasons', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context = createMockExecutionContext({
      request: { body: { reason: 'short' } },
    });

    expect(() => guard.canActivate(context)).toThrow(new BadRequestException('platform.reason_required'));
  });
});
