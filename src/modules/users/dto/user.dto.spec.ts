import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../enums/role.enum';
import { CreateUserDto, UpdateUserDto } from './user.dto';

describe('User DTOs', () => {
  describe('CreateUserDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToClass(CreateUserDto, {
        email: 'user@example.com',
        password: 'SecurePass123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with optional role', async () => {
      const dto = plainToClass(CreateUserDto, {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: Role.FIELD_STAFF,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail without email', async () => {
      const dto = plainToClass(CreateUserDto, {
        password: 'SecurePass123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid email format', async () => {
      const dto = plainToClass(CreateUserDto, {
        email: 'not-an-email',
        password: 'SecurePass123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without password', async () => {
      const dto = plainToClass(CreateUserDto, {
        email: 'user@example.com',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with password shorter than 6 characters', async () => {
      const dto = plainToClass(CreateUserDto, {
        email: 'user@example.com',
        password: 'short',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should support all role enums', async () => {
      for (const role of Object.values(Role)) {
        const dto = plainToClass(CreateUserDto, {
          email: 'user@example.com',
          password: 'SecurePass123',
          role,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('UpdateUserDto', () => {
    it('should validate with no fields', async () => {
      const dto = plainToClass(UpdateUserDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with email', async () => {
      const dto = plainToClass(UpdateUserDto, {
        email: 'newemail@example.com',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid email format', async () => {
      const dto = plainToClass(UpdateUserDto, {
        email: 'invalid-email',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept empty UpdateUserDto', async () => {
      const dto = plainToClass(UpdateUserDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
