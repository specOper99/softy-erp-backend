import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import {
  CreateTenantDto,
  DeleteTenantDto,
  ListTenantsDto,
  ReactivateTenantDto,
  SuspendTenantDto,
  UpdateTenantDto,
} from './tenant-management.dto';

describe('Tenant Management DTOs', () => {
  describe('ListTenantsDto', () => {
    it('should validate with all optional fields empty', async () => {
      const dto = plainToInstance(ListTenantsDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with valid search string', async () => {
      const dto = plainToInstance(ListTenantsDto, { search: 'test tenant' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with valid status enum', async () => {
      const dto = plainToInstance(ListTenantsDto, { status: TenantStatus.ACTIVE });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid status', async () => {
      const dto = plainToInstance(ListTenantsDto, { status: 'INVALID_STATUS' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('status');
    });

    it('should validate with valid plan enum', async () => {
      const dto = plainToInstance(ListTenantsDto, { plan: SubscriptionPlan.PRO });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with valid minRiskScore in range', async () => {
      const dto = plainToInstance(ListTenantsDto, { minRiskScore: 0.5 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with minRiskScore out of range (> 1)', async () => {
      const dto = plainToInstance(ListTenantsDto, { minRiskScore: 1.5 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('minRiskScore');
    });

    it('should fail validation with negative minRiskScore', async () => {
      const dto = plainToInstance(ListTenantsDto, { minRiskScore: -0.1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('minRiskScore');
    });

    it('should validate with valid date strings', async () => {
      const dto = plainToInstance(ListTenantsDto, {
        createdAfter: '2026-01-01',
        createdBefore: '2026-12-31',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid date string', async () => {
      const dto = plainToInstance(ListTenantsDto, { createdAfter: 'not-a-date' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('createdAfter');
    });

    it('should validate with valid limit and offset', async () => {
      const dto = plainToInstance(ListTenantsDto, { limit: 50, offset: 100 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with limit exceeding max (100)', async () => {
      const dto = plainToInstance(ListTenantsDto, { limit: 150 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });

    it('should fail validation with limit below min (1)', async () => {
      const dto = plainToInstance(ListTenantsDto, { limit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });

    it('should fail validation with negative offset', async () => {
      const dto = plainToInstance(ListTenantsDto, { offset: -1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('offset');
    });
  });

  describe('CreateTenantDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'test-tenant',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without name', async () => {
      const dto = plainToInstance(CreateTenantDto, { slug: 'test-tenant' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('name');
    });

    it('should fail validation without slug', async () => {
      const dto = plainToInstance(CreateTenantDto, { name: 'Test Tenant' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('slug');
    });

    it('should validate with optional subscriptionPlan', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'test-tenant',
        subscriptionPlan: SubscriptionPlan.PRO,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with optional billingEmail', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'test-tenant',
        billingEmail: 'billing@example.com',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid billingEmail', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'test-tenant',
        billingEmail: 'not-an-email',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('billingEmail');
    });
  });

  describe('UpdateTenantDto', () => {
    it('should validate with all optional fields empty', async () => {
      const dto = plainToInstance(UpdateTenantDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with partial fields', async () => {
      const dto = plainToInstance(UpdateTenantDto, {
        name: 'Updated Tenant Name',
        subscriptionPlan: SubscriptionPlan.ENTERPRISE,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with quotas object', async () => {
      const dto = plainToInstance(UpdateTenantDto, {
        quotas: { maxUsers: 100, maxStorage: 1000 },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with metadata object', async () => {
      const dto = plainToInstance(UpdateTenantDto, {
        metadata: { industry: 'healthcare', region: 'US' },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('SuspendTenantDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(SuspendTenantDto, {
        reason: 'Non-payment of invoices',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(SuspendTenantDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with gracePeriodDays in range', async () => {
      const dto = plainToInstance(SuspendTenantDto, {
        reason: 'Policy violation',
        gracePeriodDays: 30,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with gracePeriodDays exceeding max (90)', async () => {
      const dto = plainToInstance(SuspendTenantDto, {
        reason: 'Policy violation',
        gracePeriodDays: 100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('gracePeriodDays');
    });

    it('should fail validation with negative gracePeriodDays', async () => {
      const dto = plainToInstance(SuspendTenantDto, {
        reason: 'Policy violation',
        gracePeriodDays: -5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('gracePeriodDays');
    });

    it('should validate with suspendUntil date', async () => {
      const dto = plainToInstance(SuspendTenantDto, {
        reason: 'Temporary maintenance',
        suspendUntil: '2026-02-01T00:00:00Z',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('ReactivateTenantDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(ReactivateTenantDto, {
        reason: 'Payment received',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(ReactivateTenantDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });
  });

  describe('DeleteTenantDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(DeleteTenantDto, {
        reason: 'Customer requested account deletion',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(DeleteTenantDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should validate with scheduleFor date', async () => {
      const dto = plainToInstance(DeleteTenantDto, {
        reason: 'GDPR deletion request',
        scheduleFor: '2026-02-15T00:00:00Z',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid scheduleFor date', async () => {
      const dto = plainToInstance(DeleteTenantDto, {
        reason: 'GDPR deletion request',
        scheduleFor: 'invalid-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('scheduleFor');
    });
  });
});
