import { BillingCustomer } from './billing-customer.entity';
import { PaymentMethod } from './payment-method.entity';
import { BillingInterval, Subscription, SubscriptionStatus } from './subscription.entity';
import { UsageRecord } from './usage-record.entity';

describe('Billing Entities', () => {
  describe('BillingCustomer Entity', () => {
    it('should create a billing customer instance', () => {
      const customer = new BillingCustomer();
      customer.id = 'cust-123';
      customer.tenantId = 'tenant-456';
      customer.stripeCustomerId = 'cus_stripe123';
      customer.email = 'billing@example.com';
      customer.name = 'Acme Corp';
      customer.taxExempt = false;

      expect(customer.id).toBe('cust-123');
      expect(customer.tenantId).toBe('tenant-456');
      expect(customer.stripeCustomerId).toBe('cus_stripe123');
      expect(customer.email).toBe('billing@example.com');
      expect(customer.name).toBe('Acme Corp');
      expect(customer.taxExempt).toBe(false);
    });

    it('should support address object', () => {
      const customer = new BillingCustomer();
      customer.address = {
        line1: '123 Main St',
        line2: 'Suite 100',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      expect(customer.address).toBeDefined();
      expect(customer.address?.line1).toBe('123 Main St');
      expect(customer.address?.city).toBe('New York');
    });

    it('should handle nullable fields', () => {
      const customer = new BillingCustomer();
      customer.tenantId = 'tenant-123';
      customer.stripeCustomerId = 'cus_123';
      customer.email = null;
      customer.defaultPaymentMethodId = null;

      expect(customer.email).toBeNull();
      expect(customer.defaultPaymentMethodId).toBeNull();
    });
  });

  describe('Subscription Entity', () => {
    it('should create a subscription instance', () => {
      const subscription = new Subscription();
      subscription.id = 'sub-123';
      subscription.tenantId = 'tenant-456';
      subscription.stripeSubscriptionId = 'sub_stripe123';
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.billingInterval = BillingInterval.MONTH;

      expect(subscription.id).toBe('sub-123');
      expect(subscription.tenantId).toBe('tenant-456');
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.billingInterval).toBe(BillingInterval.MONTH);
    });

    it('should support all subscription statuses', () => {
      const statuses = [
        SubscriptionStatus.TRIALING,
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.PAST_DUE,
        SubscriptionStatus.CANCELED,
        SubscriptionStatus.UNPAID,
        SubscriptionStatus.INCOMPLETE,
        SubscriptionStatus.INCOMPLETE_EXPIRED,
        SubscriptionStatus.PAUSED,
      ];

      statuses.forEach((status) => {
        const subscription = new Subscription();
        subscription.status = status;
        expect(subscription.status).toBe(status);
      });
    });

    it('should support all billing intervals', () => {
      const intervals = [BillingInterval.MONTH, BillingInterval.YEAR];

      intervals.forEach((interval) => {
        const subscription = new Subscription();
        subscription.billingInterval = interval;
        expect(subscription.billingInterval).toBe(interval);
      });
    });

    it('should track subscription lifecycle dates', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const subscription = new Subscription();
      subscription.startDate = now;
      subscription.currentPeriodStart = now;
      subscription.currentPeriodEnd = futureDate;

      expect(subscription.startDate).toEqual(now);
      expect(subscription.currentPeriodStart).toEqual(now);
      expect(subscription.currentPeriodEnd).toEqual(futureDate);
    });

    it('should handle cancellation details', () => {
      const subscription = new Subscription();
      subscription.cancelledAt = new Date();
      subscription.cancelAtPeriodEnd = true;
      subscription.cancellationReason = 'Too expensive';

      expect(subscription.cancelledAt).toBeDefined();
      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.cancellationReason).toBe('Too expensive');
    });
  });

  describe('PaymentMethod Entity', () => {
    it('should create a payment method instance', () => {
      const paymentMethod = new PaymentMethod();
      paymentMethod.id = 'pm-123';
      paymentMethod.billingCustomerId = 'cust-456';
      paymentMethod.stripePaymentMethodId = 'pm_stripe123';
      paymentMethod.type = 'card';
      paymentMethod.isDefault = true;

      expect(paymentMethod.id).toBe('pm-123');
      expect(paymentMethod.billingCustomerId).toBe('cust-456');
      expect(paymentMethod.stripePaymentMethodId).toBe('pm_stripe123');
      expect(paymentMethod.type).toBe('card');
      expect(paymentMethod.isDefault).toBe(true);
    });

    it('should support payment method metadata', () => {
      const paymentMethod = new PaymentMethod();
      paymentMethod.metadata = {
        cardholderName: 'John Doe',
        last4: '4242',
        expiryMonth: '12',
        expiryYear: '2025',
      };

      expect(paymentMethod.metadata).toBeDefined();
      expect(paymentMethod.metadata?.last4).toBe('4242');
    });

    it('should handle null expiry for non-card types', () => {
      const paymentMethod = new PaymentMethod();
      paymentMethod.type = 'bank_account';
      paymentMethod.expiresAt = null;

      expect(paymentMethod.expiresAt).toBeNull();
    });
  });

  describe('UsageRecord Entity', () => {
    it('should create a usage record instance', () => {
      const usageRecord = new UsageRecord();
      usageRecord.id = 'usage-123';
      usageRecord.tenantId = 'tenant-456';
      usageRecord.metricName = 'api_calls';
      usageRecord.quantity = 1500;
      usageRecord.timestamp = new Date();

      expect(usageRecord.id).toBe('usage-123');
      expect(usageRecord.tenantId).toBe('tenant-456');
      expect(usageRecord.metricName).toBe('api_calls');
      expect(usageRecord.quantity).toBe(1500);
      expect(usageRecord.timestamp).toBeDefined();
    });

    it('should support usage record reference', () => {
      const usageRecord = new UsageRecord();
      usageRecord.idempotencyKey = 'usage_idem_key_123';
      usageRecord.reportedAt = new Date();

      expect(usageRecord.idempotencyKey).toBe('usage_idem_key_123');
      expect(usageRecord.reportedAt).toBeDefined();
    });

    it('should track metering data', () => {
      const usageRecord = new UsageRecord();
      usageRecord.metricName = 'data_processed_gb';
      usageRecord.quantity = 25.5;
      usageRecord.unit = 'gigabyte';

      expect(usageRecord.metricName).toBe('data_processed_gb');
      expect(usageRecord.quantity).toBe(25.5);
      expect(usageRecord.unit).toBe('gigabyte');
    });
  });

  describe('Entity Relationships', () => {
    it('should support subscription-customer relationship', () => {
      const customer = new BillingCustomer();
      customer.id = 'cust-123';

      const subscription = new Subscription();
      subscription.id = 'sub-123';
      subscription.billingCustomerId = customer.id;

      expect(subscription.billingCustomerId).toBe(customer.id);
    });

    it('should support payment-method-customer relationship', () => {
      const customer = new BillingCustomer();
      customer.id = 'cust-123';
      customer.defaultPaymentMethodId = 'pm-456';

      expect(customer.defaultPaymentMethodId).toBe('pm-456');
    });
  });
});
