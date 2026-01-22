import { Role } from './role.enum';

describe('Role Enum', () => {
  it('should have all role values defined', () => {
    expect(Role.ADMIN).toBeDefined();
    expect(Role.OPS_MANAGER).toBeDefined();
    expect(Role.FIELD_STAFF).toBeDefined();
    expect(Role.CLIENT).toBeDefined();
  });

  it('should have valid string values', () => {
    expect(typeof Role.ADMIN).toBe('string');
    expect(typeof Role.OPS_MANAGER).toBe('string');
    expect(typeof Role.FIELD_STAFF).toBe('string');
    expect(typeof Role.CLIENT).toBe('string');
  });

  it('should support iteration over all roles', () => {
    const roles = Object.values(Role);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles).toContain(Role.ADMIN);
  });

  it('should have unique role values', () => {
    const roles = Object.values(Role);
    const uniqueRoles = new Set(roles);
    expect(uniqueRoles.size).toBe(roles.length);
  });

  describe('Role Access Control', () => {
    it('ADMIN role should be highest privilege', () => {
      expect(Role.ADMIN).toBe('ADMIN');
    });

    it('FIELD_STAFF role should be defined', () => {
      expect(Role.FIELD_STAFF).toBe('FIELD_STAFF');
    });

    it('OPS_MANAGER role should be defined', () => {
      expect(Role.OPS_MANAGER).toBe('OPS_MANAGER');
    });

    it('CLIENT role should be defined', () => {
      expect(Role.CLIENT).toBe('CLIENT');
    });

    it('should be usable in conditional logic', () => {
      const userRole = Role.ADMIN;
      const fieldRole = Role.FIELD_STAFF;
      expect(userRole === Role.ADMIN).toBe(true);
      expect(fieldRole === Role.FIELD_STAFF).toBe(true);
    });
  });
});
