import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '../../modules/users/domain/enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function createExecutionContext(user?: unknown, method = 'GET'): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, method }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('returns true for GET when no roles are required (read fail-open)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext(undefined, 'GET'))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalled();
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('returns false for mutating methods when no roles are required (fail-closed)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext({ role: Role.ADMIN }, 'POST'))).toBe(false);
    expect(guard.canActivate(createExecutionContext({ role: Role.ADMIN }, 'PATCH'))).toBe(false);
    expect(guard.canActivate(createExecutionContext({ role: Role.ADMIN }, 'PUT'))).toBe(false);
    expect(guard.canActivate(createExecutionContext({ role: Role.ADMIN }, 'DELETE'))).toBe(false);
  });

  it('throws UnauthorizedException when roles are required but user is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createExecutionContext(undefined))).toThrow(UnauthorizedException);
  });

  it('returns true when user has a required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN, Role.OPS_MANAGER]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext({ role: Role.ADMIN }))).toBe(true);
  });

  it('returns false when user lacks required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext({ role: Role.OPS_MANAGER }))).toBe(false);
  });
});
