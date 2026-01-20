import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingInterval } from '../entities/subscription.entity';
import { BillingAddressDto, CreatePaymentMethodDto, CreateSubscriptionDto, UpdateSubscriptionDto } from './billing.dto';

describe('Billing DTOs', () => {
  describe('CreateSubscriptionDto', () => {
    it('should validate with required fields only', async () => {
      const dto = plainToClass(CreateSubscriptionDto, {
        priceId: 'price_123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with all optional fields', async () => {
      const dto = plainToClass(CreateSubscriptionDto, {
        priceId: 'price_123',
        paymentMethodId: 'pm_456',
        billingInterval: BillingInterval.MONTH,
        trialFromPlan: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when priceId is missing', async () => {
      const dto = plainToClass(CreateSubscriptionDto, {
        paymentMethodId: 'pm_456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('priceId');
    });

    it('should fail when priceId is not a string', async () => {
      const dto = plainToClass(CreateSubscriptionDto, {
        priceId: 123,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid billingInterval', async () => {
      const dto = plainToClass(CreateSubscriptionDto, {
        priceId: 'price_123',
        billingInterval: 'INVALID_INTERVAL',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid billingInterval values', async () => {
      for (const interval of Object.values(BillingInterval)) {
        const dto = plainToClass(CreateSubscriptionDto, {
          priceId: 'price_123',
          billingInterval: interval,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });
  });

  describe('UpdateSubscriptionDto', () => {
    it('should validate with no fields', async () => {
      const dto = plainToClass(UpdateSubscriptionDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with priceId', async () => {
      const dto = plainToClass(UpdateSubscriptionDto, {
        priceId: 'price_789',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with cancelAtPeriodEnd', async () => {
      const dto = plainToClass(UpdateSubscriptionDto, {
        cancelAtPeriodEnd: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with all fields', async () => {
      const dto = plainToClass(UpdateSubscriptionDto, {
        priceId: 'price_789',
        cancelAtPeriodEnd: false,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when priceId is not a string', async () => {
      const dto = plainToClass(UpdateSubscriptionDto, {
        priceId: 123,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when cancelAtPeriodEnd is not a boolean', async () => {
      const dto = plainToClass(UpdateSubscriptionDto, {
        cancelAtPeriodEnd: 'true',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreatePaymentMethodDto', () => {
    it('should validate with required fields only', async () => {
      const dto = plainToClass(CreatePaymentMethodDto, {
        paymentMethodId: 'pm_123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with setAsDefault', async () => {
      const dto = plainToClass(CreatePaymentMethodDto, {
        paymentMethodId: 'pm_123',
        setAsDefault: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when paymentMethodId is missing', async () => {
      const dto = plainToClass(CreatePaymentMethodDto, {
        setAsDefault: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('paymentMethodId');
    });

    it('should fail when paymentMethodId is not a string', async () => {
      const dto = plainToClass(CreatePaymentMethodDto, {
        paymentMethodId: 123,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('BillingAddressDto', () => {
    it('should validate with no fields', async () => {
      const dto = plainToClass(BillingAddressDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with all address fields', async () => {
      const dto = plainToClass(BillingAddressDto, {
        line1: '123 Main St',
        line2: 'Suite 100',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with partial address', async () => {
      const dto = plainToClass(BillingAddressDto, {
        line1: '123 Main St',
        city: 'New York',
        country: 'US',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when address fields are not strings', async () => {
      const dto = plainToClass(BillingAddressDto, {
        line1: 123,
        city: ['New York'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
