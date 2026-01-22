import { UserDeletedEvent } from './user-deleted.event';

describe('UserDeletedEvent', () => {
  it('should create a user deleted event', () => {
    const event = new UserDeletedEvent();
    event.userId = 'user-123';
    event.tenantId = 'tenant-456';
    event.deletedAt = new Date();
    event.deletedBy = 'admin-789';

    expect(event.userId).toBe('user-123');
    expect(event.tenantId).toBe('tenant-456');
    expect(event.deletedAt).toBeDefined();
    expect(event.deletedBy).toBe('admin-789');
  });

  it('should support cascade deletion flag', () => {
    const event = new UserDeletedEvent();
    event.userId = 'user-123';
    event.cascadeDelete = true;

    expect(event.cascadeDelete).toBe(true);
  });

  it('should support reason for deletion', () => {
    const event = new UserDeletedEvent();
    event.userId = 'user-123';
    event.reason = 'Account termination request';

    expect(event.reason).toBe('Account termination request');
  });

  it('should have timestamp for auditing', () => {
    const event = new UserDeletedEvent();
    const now = new Date();
    event.userId = 'user-123';
    event.deletedAt = now;

    expect(event.deletedAt).toEqual(now);
  });
});
