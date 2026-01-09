import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../modules/users/enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function createExecutionContext(user?: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('returns true when no roles are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('throws UnauthorizedException when roles are required but user is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createExecutionContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('returns true when user has a required role', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([Role.ADMIN, Role.OPS_MANAGER]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(createExecutionContext({ role: Role.ADMIN })),
    ).toBe(true);
  });

  it('returns false when user lacks required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(createExecutionContext({ role: Role.OPS_MANAGER })),
    ).toBe(false);
  });
});
