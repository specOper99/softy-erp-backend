import { UserDeletedEvent } from './user-deleted.event';

describe('UserDeletedEvent', () => {
  it('should create a user deleted event with all fields', () => {
    const event = new UserDeletedEvent('user-123', 'tenant-456', 'user@example.com');

    expect(event.userId).toBe('user-123');
    expect(event.tenantId).toBe('tenant-456');
    expect(event.email).toBe('user@example.com');
  });

  it('should expose userId', () => {
    const event = new UserDeletedEvent('user-abc', 'tenant-xyz', 'a@b.com');
    expect(event.userId).toBe('user-abc');
  });

  it('should expose tenantId', () => {
    const event = new UserDeletedEvent('user-abc', 'tenant-xyz', 'a@b.com');
    expect(event.tenantId).toBe('tenant-xyz');
  });

  it('should expose email', () => {
    const event = new UserDeletedEvent('user-abc', 'tenant-xyz', 'a@b.com');
    expect(event.email).toBe('a@b.com');
  });
});
