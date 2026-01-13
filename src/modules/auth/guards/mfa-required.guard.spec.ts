import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../users/enums/role.enum';
import { MfaRequiredGuard } from './mfa-required.guard';

describe('MfaRequiredGuard', () => {
  let guard: MfaRequiredGuard;
  let reflector: Reflector;

  const mockRequest = {
    user: {
      id: 'user-123',
      role: Role.ADMIN,
      isMfaEnabled: true,
    },
  };

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => mockRequest,
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaRequiredGuard,
        Reflector,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'MFA_REQUIRED_ROLES') return 'ADMIN';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<MfaRequiredGuard>(MfaRequiredGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when @MfaRequired not present', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should allow when MFA not required for role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const requestWithUser = {
        user: {
          id: 'user-123',
          role: Role.USER,
          isMfaEnabled: false,
        },
      };

      const context = {
        ...mockExecutionContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithUser,
        }),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when user has MFA enabled', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when no user', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const requestWithoutUser = {};
      const context = {
        ...mockExecutionContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithoutUser,
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Authentication required');
    });

    it('should throw ForbiddenException when admin without MFA', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const requestWithAdminNoMfa = {
        user: {
          id: 'admin-123',
          role: Role.ADMIN,
          isMfaEnabled: false,
        },
      };

      const context = {
        ...mockExecutionContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithAdminNoMfa,
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('MFA is required');
    });
  });
});
