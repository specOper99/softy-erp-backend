import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../modules/users/enums/role.enum';
import { resolveRequestedUserIdScope } from './field-staff-user-scope.helper';

describe('resolveRequestedUserIdScope', () => {
  const fieldStaffUser = {
    id: 'field-staff-user-id',
    role: Role.FIELD_STAFF,
  };

  it('returns requestedUserId when FIELD_STAFF requests self', () => {
    expect(resolveRequestedUserIdScope(fieldStaffUser, fieldStaffUser.id)).toBe(fieldStaffUser.id);
  });

  it('throws when FIELD_STAFF requests another userId', () => {
    expect(() => resolveRequestedUserIdScope(fieldStaffUser, 'other-user-id')).toThrow(ForbiddenException);
  });

  it('returns current user id when FIELD_STAFF requestedUserId is undefined', () => {
    expect(resolveRequestedUserIdScope(fieldStaffUser, undefined)).toBe(fieldStaffUser.id);
  });

  it('returns current user id when FIELD_STAFF requestedUserId is empty', () => {
    expect(resolveRequestedUserIdScope(fieldStaffUser, '')).toBe(fieldStaffUser.id);
  });

  it('returns requestedUserId unchanged for non FIELD_STAFF roles', () => {
    const requestedUserId = 'requested-user-id';
    const opsManagerUser = { id: 'ops-user-id', role: Role.OPS_MANAGER };
    const adminUser = { id: 'admin-user-id', role: Role.ADMIN };

    expect(resolveRequestedUserIdScope(opsManagerUser, requestedUserId)).toBe(requestedUserId);
    expect(resolveRequestedUserIdScope(adminUser, requestedUserId)).toBe(requestedUserId);
  });
});
