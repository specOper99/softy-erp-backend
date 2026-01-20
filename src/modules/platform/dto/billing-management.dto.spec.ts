import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import {
  ApplyCreditDto,
  BillingReconciliationQueryDto,
  IssueRefundDto,
  RetryInvoiceDto,
  UpdateSubscriptionDto,
} from './billing-management.dto';

describe('Billing Management DTOs', () => {
  describe('UpdateSubscriptionDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToInstance(UpdateSubscriptionDto, {
        plan: SubscriptionPlan.PRO,
        reason: 'Customer upgrade request',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without plan', async () => {
      const dto = plainToInstance(UpdateSubscriptionDto, {
        reason: 'Customer upgrade request',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('plan');
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(UpdateSubscriptionDto, {
        plan: SubscriptionPlan.PRO,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });

    it('should fail validation with invalid plan', async () => {
      const dto = plainToInstance(UpdateSubscriptionDto, {
        plan: 'INVALID_PLAN',
        reason: 'Test',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('plan');
    });

    it('should validate with optional effectiveDate', async () => {
      const dto = plainToInstance(UpdateSubscriptionDto, {
        plan: SubscriptionPlan.ENTERPRISE,
        reason: 'Scheduled upgrade',
        effectiveDate: '2026-02-01',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid effectiveDate', async () => {
      const dto = plainToInstance(UpdateSubscriptionDto, {
        plan: SubscriptionPlan.ENTERPRISE,
        reason: 'Test',
        effectiveDate: 'not-a-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('effectiveDate');
    });
  });

  describe('IssueRefundDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        invoiceId: 'INV-001',
        amount: 99.99,
        reason: 'Service issue',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without invoiceId', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        amount: 99.99,
        reason: 'Service issue',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('invoiceId');
    });

    it('should fail validation without amount', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        invoiceId: 'INV-001',
        reason: 'Service issue',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('amount');
    });

    it('should fail validation with non-positive amount', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        invoiceId: 'INV-001',
        amount: 0,
        reason: 'Service issue',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('amount');
    });

    it('should fail validation with negative amount', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        invoiceId: 'INV-001',
        amount: -50,
        reason: 'Service issue',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('amount');
    });

    it('should validate with optional notes', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        invoiceId: 'INV-001',
        amount: 99.99,
        reason: 'Service issue',
        notes: 'Additional internal notes',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('ApplyCreditDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToInstance(ApplyCreditDto, {
        amount: 50.0,
        reason: 'Loyalty reward',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without amount', async () => {
      const dto = plainToInstance(ApplyCreditDto, {
        reason: 'Loyalty reward',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('amount');
    });

    it('should fail validation with non-positive amount', async () => {
      const dto = plainToInstance(ApplyCreditDto, {
        amount: 0,
        reason: 'Test',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('amount');
    });

    it('should validate with optional expiresAt', async () => {
      const dto = plainToInstance(ApplyCreditDto, {
        amount: 100.0,
        reason: 'Promotional credit',
        expiresAt: '2026-12-31T23:59:59Z',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('BillingReconciliationQueryDto', () => {
    it('should validate with all optional fields empty', async () => {
      const dto = plainToInstance(BillingReconciliationQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with date range', async () => {
      const dto = plainToInstance(BillingReconciliationQueryDto, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with plan filter', async () => {
      const dto = plainToInstance(BillingReconciliationQueryDto, {
        plan: SubscriptionPlan.PRO,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with limit within range', async () => {
      const dto = plainToInstance(BillingReconciliationQueryDto, {
        limit: 50,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with limit below minimum', async () => {
      const dto = plainToInstance(BillingReconciliationQueryDto, {
        limit: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });
  });

  describe('RetryInvoiceDto', () => {
    it('should validate with required reason', async () => {
      const dto = plainToInstance(RetryInvoiceDto, {
        reason: 'Payment gateway temporary failure',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(RetryInvoiceDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });
  });
});
