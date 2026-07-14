import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../modules/users/domain/enums/role.enum';
import { createMockExecutionContext } from '../../../test/helpers/test-setup.utils';
import { AbilityFactory } from './ability.factory';
import { AbilityGuard } from './ability.guard';

describe('AbilityGuard', () => {
  let guard: AbilityGuard;
  let reflector: Reflector;
  const factory = new AbilityFactory();

  beforeEach(() => {
    reflector = new Reflector();
    guard = new AbilityGuard(reflector, factory);
  });

  it('allows routes without @CheckAbility metadata', () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);

    expect(guard.canActivate(createMockExecutionContext())).toBe(true);
  });

  it('denies unauthenticated users when ability metadata is present', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'delete', subject: 'Invoice' });

    const context = createMockExecutionContext({ request: { user: undefined } });

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException('common.authentication_required'));
  });

  it('denies when CASL ability cannot perform the requested action', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'delete', subject: 'Invoice' });

    const context = createMockExecutionContext({
      request: { user: { id: 'u1', role: Role.OPS_MANAGER, tenantId: 't1' } },
    });

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException('common.forbidden'));
  });

  it('allows when CASL ability permits the requested action', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'read', subject: 'Invoice' });

    const context = createMockExecutionContext({
      request: { user: { id: 'u1', role: Role.OPS_MANAGER, tenantId: 't1' } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes clientId into ability factory for scoped CLIENT rules', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'read', subject: 'Booking' });
    const buildSpy = jest.spyOn(factory, 'build');

    const context = createMockExecutionContext({
      request: { user: { id: 'u1', role: Role.CLIENT, tenantId: 't1', clientId: 'c1' } },
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(buildSpy).toHaveBeenCalledWith({
      id: 'u1',
      role: Role.CLIENT,
      tenantId: 't1',
      clientId: 'c1',
    });
  });
});
