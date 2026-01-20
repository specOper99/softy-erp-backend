import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ForcePasswordResetDto,
  InitiateDataDeletionDto,
  InitiateDataExportDto,
  RevokeSessionsDto,
  UpdateIpAllowlistDto,
  UpdateSecurityPolicyDto,
} from './security.dto';

describe('Security DTOs', () => {
  describe('ForcePasswordResetDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(ForcePasswordResetDto, {
        reason: 'Suspected credential compromise',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(ForcePasswordResetDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with notifyUser true', async () => {
      const dto = plainToInstance(ForcePasswordResetDto, {
        reason: 'Security policy update',
        notifyUser: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with notifyUser false', async () => {
      const dto = plainToInstance(ForcePasswordResetDto, {
        reason: 'Security policy update',
        notifyUser: false,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with non-boolean notifyUser', async () => {
      const dto = plainToInstance(ForcePasswordResetDto, {
        reason: 'Test',
        notifyUser: 'yes', // Should be boolean
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('notifyUser');
    });
  });

  describe('RevokeSessionsDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(RevokeSessionsDto, {
        reason: 'Security incident response',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(RevokeSessionsDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with notifyUser option', async () => {
      const dto = plainToInstance(RevokeSessionsDto, {
        reason: 'Security incident response',
        notifyUser: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('UpdateIpAllowlistDto', () => {
    it('should validate with valid IP addresses', async () => {
      const dto = plainToInstance(UpdateIpAllowlistDto, {
        ipAddresses: ['192.168.1.1', '10.0.0.0/8', '2001:db8::1'],
        reason: 'Office IP update',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without ipAddresses', async () => {
      const dto = plainToInstance(UpdateIpAllowlistDto, {
        reason: 'Office IP update',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('ipAddresses');
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(UpdateIpAllowlistDto, {
        ipAddresses: ['192.168.1.1'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with empty array for clearing allowlist', async () => {
      const dto = plainToInstance(UpdateIpAllowlistDto, {
        ipAddresses: [],
        reason: 'Removing IP restrictions',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation if ipAddresses contains non-string', async () => {
      const dto = plainToInstance(UpdateIpAllowlistDto, {
        ipAddresses: ['192.168.1.1', 12345],
        reason: 'Test',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('ipAddresses');
    });
  });

  describe('InitiateDataExportDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(InitiateDataExportDto, {
        reason: 'GDPR subject access request',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(InitiateDataExportDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with dataCategories', async () => {
      const dto = plainToInstance(InitiateDataExportDto, {
        dataCategories: ['personal_data', 'transactions', 'audit_logs'],
        reason: 'GDPR request',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with empty dataCategories for full export', async () => {
      const dto = plainToInstance(InitiateDataExportDto, {
        dataCategories: [],
        reason: 'Full data export',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('InitiateDataDeletionDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(InitiateDataDeletionDto, {
        reason: 'GDPR right to be forgotten',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(InitiateDataDeletionDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with hardDelete true', async () => {
      const dto = plainToInstance(InitiateDataDeletionDto, {
        reason: 'Complete data purge requested',
        hardDelete: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with hardDelete false (soft delete)', async () => {
      const dto = plainToInstance(InitiateDataDeletionDto, {
        reason: 'Standard deletion',
        hardDelete: false,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('UpdateSecurityPolicyDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToInstance(UpdateSecurityPolicyDto, {
        policyKey: 'password_policy',
        policyValue: { minLength: 12, requireSpecialChars: true },
        reason: 'Security standards update',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without policyKey', async () => {
      const dto = plainToInstance(UpdateSecurityPolicyDto, {
        policyValue: { minLength: 12 },
        reason: 'Test',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('policyKey');
    });

    it('should fail validation without policyValue', async () => {
      const dto = plainToInstance(UpdateSecurityPolicyDto, {
        policyKey: 'password_policy',
        reason: 'Test',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('policyValue');
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(UpdateSecurityPolicyDto, {
        policyKey: 'password_policy',
        policyValue: { minLength: 12 },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with complex policyValue object', async () => {
      const dto = plainToInstance(UpdateSecurityPolicyDto, {
        policyKey: 'mfa_policy',
        policyValue: {
          required: true,
          methods: ['totp', 'sms'],
          gracePeriod: 7,
          exemptRoles: ['SERVICE_ACCOUNT'],
        },
        reason: 'Enforcing MFA across organization',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
