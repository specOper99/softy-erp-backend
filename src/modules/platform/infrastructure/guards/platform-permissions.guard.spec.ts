import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMockExecutionContext } from '../../../../../test/helpers/test-setup.utils';
import { PlatformPermission } from '../../domain/enums/platform-permission.enum';
import { PlatformRole } from '../../domain/enums/platform-role.enum';
import { PlatformPermissionsGuard } from './platform-permissions.guard';

describe('PlatformPermissionsGuard', () => {
  let guard: PlatformPermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PlatformPermissionsGuard(reflector);
  });

  it('allows routes without required platform permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(createMockExecutionContext())).toBe(true);
  });

  it('requires a platform role when permissions are declared', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_READ]);

    const context = createMockExecutionContext({ request: { user: {} } });

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException('platform.role_required'));
  });

  it('allows SUPER_ADMIN for any declared permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_DELETE]);

    const context = createMockExecutionContext({
      request: { user: { platformRole: PlatformRole.SUPER_ADMIN } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows BILLING_ADMIN for billing read via role fallback', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.BILLING_READ]);

    const context = createMockExecutionContext({
      request: { user: { role: PlatformRole.BILLING_ADMIN } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies BILLING_ADMIN for support impersonation', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.SUPPORT_IMPERSONATE]);

    const context = createMockExecutionContext({
      request: { user: { platformRole: PlatformRole.BILLING_ADMIN } },
    });

    try {
      guard.canActivate(context);
      fail('Expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual(
        expect.objectContaining({
          code: 'platform.permissions_missing',
        }),
      );
    }
  });

  it('requires every declared permission to be granted', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([PlatformPermission.TENANTS_READ, PlatformPermission.SUPPORT_IMPERSONATE]);

    const context = createMockExecutionContext({
      request: { user: { platformRole: PlatformRole.ANALYTICS_VIEWER } },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
