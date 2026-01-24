import { UserDeactivatedEvent } from './user-deactivated.event';

describe('UserDeactivatedEvent', () => {
  it('should construct with userId and tenantId', () => {
    const event = new UserDeactivatedEvent('user-1', 'tenant-1');
    expect(event.userId).toBe('user-1');
    expect(event.tenantId).toBe('tenant-1');
  });
});
