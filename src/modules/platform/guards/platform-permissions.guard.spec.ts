import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformRole } from '../enums/platform-role.enum';
import { PlatformPermissionsGuard } from './platform-permissions.guard';

describe('PlatformPermissionsGuard', () => {
  let guard: PlatformPermissionsGuard;
  let reflector: Reflector;

  const createMockExecutionContext = (user: object | null): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformPermissionsGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<PlatformPermissionsGuard>(PlatformPermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no permissions are required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockExecutionContext({ platformRole: PlatformRole.ANALYTICS_VIEWER });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when empty permissions array is required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const context = createMockExecutionContext({ platformRole: PlatformRole.ANALYTICS_VIEWER });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_READ]);
      const context = createMockExecutionContext(null);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Platform role required');
    });

    it('should throw ForbiddenException when user has no platformRole', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_READ]);
      const context = createMockExecutionContext({ id: 'user-123' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Platform role required');
    });

    // SUPER_ADMIN role tests
    describe('SUPER_ADMIN role', () => {
      it('should allow access to all permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([
            PlatformPermission.TENANTS_DELETE,
            PlatformPermission.BILLING_REFUND,
            PlatformPermission.DATA_DELETE,
          ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPER_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should allow access to SUPPORT_TIME_ENTRIES permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.SUPPORT_TIME_ENTRIES]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPER_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });
    });

    // SUPPORT_ADMIN role tests
    describe('SUPPORT_ADMIN role', () => {
      it('should allow access to TENANTS_READ permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_READ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPPORT_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should allow access to SUPPORT_IMPERSONATE permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.SUPPORT_IMPERSONATE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPPORT_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should deny access to TENANTS_DELETE permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_DELETE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPPORT_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => guard.canActivate(context)).toThrow(/Missing required permissions/);
      });

      it('should deny access to BILLING_REFUND permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.BILLING_REFUND]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPPORT_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    // BILLING_ADMIN role tests
    describe('BILLING_ADMIN role', () => {
      it('should allow access to billing permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([
            PlatformPermission.BILLING_READ,
            PlatformPermission.BILLING_MANAGE,
            PlatformPermission.BILLING_REFUND,
          ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.BILLING_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should deny access to SUPPORT_IMPERSONATE permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.SUPPORT_IMPERSONATE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.BILLING_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });

      it('should deny access to DATA_DELETE permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.DATA_DELETE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.BILLING_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    // COMPLIANCE_ADMIN role tests
    describe('COMPLIANCE_ADMIN role', () => {
      it('should allow access to data management permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([PlatformPermission.DATA_EXPORT, PlatformPermission.DATA_DELETE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.COMPLIANCE_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should allow access to audit log permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([PlatformPermission.AUDIT_LOGS_READ, PlatformPermission.AUDIT_LOGS_EXPORT]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.COMPLIANCE_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should deny access to BILLING_MANAGE permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.BILLING_MANAGE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.COMPLIANCE_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    // SECURITY_ADMIN role tests
    describe('SECURITY_ADMIN role', () => {
      it('should allow access to security permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([
            PlatformPermission.SECURITY_POLICIES_MANAGE,
            PlatformPermission.SECURITY_FORCE_PASSWORD_RESET,
            PlatformPermission.SECURITY_REVOKE_SESSIONS,
          ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SECURITY_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should allow access to TENANTS_LOCK permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_LOCK]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SECURITY_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should deny access to DATA_DELETE permission', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.DATA_DELETE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SECURITY_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    // ANALYTICS_VIEWER role tests
    describe('ANALYTICS_VIEWER role', () => {
      it('should allow access to read-only analytics permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([
            PlatformPermission.TENANTS_READ,
            PlatformPermission.ANALYTICS_VIEW,
            PlatformPermission.AUDIT_LOGS_READ,
          ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.ANALYTICS_VIEWER });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should deny access to any write permissions', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_UPDATE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.ANALYTICS_VIEWER });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    // Multiple permissions tests
    describe('multiple permissions requirement', () => {
      it('should require ALL permissions to be present', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
          PlatformPermission.TENANTS_READ,
          PlatformPermission.TENANTS_DELETE, // Only SUPER_ADMIN has this
        ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPPORT_ADMIN });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });

      it('should allow access when user has all required permissions', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([
            PlatformPermission.TENANTS_READ,
            PlatformPermission.SUPPORT_IMPERSONATE,
            PlatformPermission.SUPPORT_VIEW_LOGS,
          ]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.SUPPORT_ADMIN });

        expect(guard.canActivate(context)).toBe(true);
      });
    });

    // Unknown role tests
    describe('unknown role handling', () => {
      it('should deny access for unknown platform role', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.TENANTS_READ]);
        const context = createMockExecutionContext({ platformRole: 'UNKNOWN_ROLE' });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    // Error message tests
    describe('error messages', () => {
      it('should include missing permissions in error message', () => {
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockReturnValue([PlatformPermission.TENANTS_DELETE, PlatformPermission.DATA_DELETE]);
        const context = createMockExecutionContext({ platformRole: PlatformRole.ANALYTICS_VIEWER });

        try {
          guard.canActivate(context);
          fail('Expected ForbiddenException to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ForbiddenException);
          expect((error as ForbiddenException).message).toContain(PlatformPermission.TENANTS_DELETE);
          expect((error as ForbiddenException).message).toContain(PlatformPermission.DATA_DELETE);
        }
      });
    });
  });
});
