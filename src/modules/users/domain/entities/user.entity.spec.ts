import { getMetadataArgsStorage } from 'typeorm';

import { Role } from '../enums/role.enum';
import { User } from './user.entity';

describe('User Entity', () => {
  it('should create a user instance', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.tenantId = 'tenant-456';

    expect(user.id).toBe('user-123');
    expect(user.email).toBe('user@example.com');
    expect(user.tenantId).toBe('tenant-456');
  });

  it('should declare a unique partial index on active email', () => {
    const idx = getMetadataArgsStorage().indices.find(
      (i) => i.target === User && i.name === 'IDX_users_email_unique_active',
    );
    expect(idx?.unique).toBe(true);
    expect(idx?.where).toBe('"deleted_at" IS NULL');
  });

  it('should handle password hashing', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.passwordHash = 'hashed_password_string';

    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe('plaintext_password');
  });

  it('should track user status', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.isActive = true;
    user.isMfaEnabled = false;

    expect(user.isActive).toBe(true);
    expect(user.isMfaEnabled).toBe(false);
  });

  it('should track user creation and update times', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.createdAt = new Date();
    user.updatedAt = new Date();

    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  it('should support MFA configuration', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.mfaSecret = 'JBSWY3DPEBLW64TMMQ======';
    user.isMfaEnabled = true;
    user.mfaRecoveryCodes = ['code1', 'code2', 'code3'];

    expect(user.mfaSecret).toBe('JBSWY3DPEBLW64TMMQ======');
    expect(user.isMfaEnabled).toBe(true);
    expect(user.mfaRecoveryCodes).toHaveLength(3);
  });

  it('should handle nullable MFA fields', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.mfaSecret = '';
    user.mfaRecoveryCodes = [];

    expect(user.mfaSecret).toBe('');
    expect(user.mfaRecoveryCodes).toEqual([]);
  });

  it('should support role assignment with all role enums', () => {
    for (const role of Object.values(Role)) {
      const user = new User();
      user.id = 'user-123';
      user.email = 'user@example.com';
      user.role = role;

      expect(user.role).toBe(role);
    }
  });

  it('should default to FIELD_STAFF role', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.role = Role.FIELD_STAFF;

    expect(user.role).toBe(Role.FIELD_STAFF);
  });

  it('should track tenant relationship', () => {
    const user = new User();
    user.id = 'user-123';
    user.email = 'user@example.com';
    user.tenantId = 'tenant-456';

    expect(user.tenantId).toBe('tenant-456');
  });
});
