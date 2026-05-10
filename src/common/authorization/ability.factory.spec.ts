import { Role } from '../../modules/users/enums/role.enum';
import { AbilityFactory } from './ability.factory';

describe('AbilityFactory', () => {
  const factory = new AbilityFactory();
  const baseUser = { id: 'u1', tenantId: 't1' };

  it('grants ADMIN manage on every subject', () => {
    const ability = factory.build({ ...baseUser, role: Role.ADMIN });
    expect(ability.can('delete', 'Webhook')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(true);
  });

  it('grants OPS_MANAGER read on Invoice but not delete', () => {
    const ability = factory.build({ ...baseUser, role: Role.OPS_MANAGER });
    expect(ability.can('read', 'Invoice')).toBe(true);
    expect(ability.can('delete', 'Invoice')).toBe(false);
  });

  it('restricts FIELD_STAFF to read/update Task and read Booking', () => {
    const ability = factory.build({ ...baseUser, role: Role.FIELD_STAFF });
    expect(ability.can('read', 'Task')).toBe(true);
    expect(ability.can('update', 'Task')).toBe(true);
    expect(ability.can('delete', 'Task')).toBe(false);
    expect(ability.can('read', 'Booking')).toBe(true);
    expect(ability.can('update', 'Booking')).toBe(false);
  });

  it('restricts CLIENT to read on Booking and Invoice only', () => {
    const ability = factory.build({ ...baseUser, role: Role.CLIENT });
    expect(ability.can('read', 'Booking')).toBe(true);
    expect(ability.can('read', 'Invoice')).toBe(true);
    expect(ability.can('update', 'Booking')).toBe(false);
    expect(ability.can('manage', 'Webhook')).toBe(false);
  });
});
