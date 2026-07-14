import { subject } from '@casl/ability';
import { Role } from '../../modules/users/domain/enums/role.enum';
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
    expect(ability.can('read', subject('Task', { assignedUserId: 'u1', tenantId: 't1' }))).toBe(true);
    expect(ability.can('update', subject('Task', { assignedUserId: 'u1', tenantId: 't1' }))).toBe(true);
    expect(ability.can('delete', 'Task')).toBe(false);
    expect(ability.can('read', subject('Booking', { tenantId: 't1' }))).toBe(true);
    expect(ability.can('update', 'Booking')).toBe(false);
  });

  it('restricts CLIENT to read on Booking and Invoice only', () => {
    const ability = factory.build({ ...baseUser, role: Role.CLIENT });
    expect(ability.can('read', subject('Booking', { tenantId: 't1' }))).toBe(true);
    expect(ability.can('read', subject('Invoice', { tenantId: 't1' }))).toBe(true);
    expect(ability.can('update', 'Booking')).toBe(false);
    expect(ability.can('manage', 'Webhook')).toBe(false);
  });

  it('scopes FIELD_STAFF task updates to assigned user', () => {
    const ability = factory.build({ ...baseUser, role: Role.FIELD_STAFF });
    expect(ability.can('update', subject('Task', { assignedUserId: 'u1', tenantId: 't1' }))).toBe(true);
    expect(ability.can('update', subject('Task', { assignedUserId: 'other', tenantId: 't1' }))).toBe(false);
  });

  it('maps entity names to CASL subjects for shadow comparisons', () => {
    expect(factory.mapResourceType('Invoice')).toBe('Invoice');
    expect(factory.mapResourceType('UnknownEntity')).toBeNull();
  });
});
