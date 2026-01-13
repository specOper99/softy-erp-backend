import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured - billing features disabled');
      return;
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });
  }

  getClient(): Stripe | null {
    return this.stripe ?? null;
  }

  isConfigured(): boolean {
    return !!this.stripe;
  }

  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    return this.stripe.customers.create(params);
  }

  async updateCustomer(customerId: string, params: Stripe.CustomerUpdateParams): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, params);
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    return this.stripe.customers.del(customerId);
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.stripe.customers.retrieve(customerId);
  }

  async createSubscription(params: Stripe.SubscriptionCreateParams): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create(params);
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, params);
  }

  async cancelSubscription(
    subscriptionId: string,
    params?: Stripe.SubscriptionCancelParams,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId, params);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async listPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethodListParams.Type = 'card',
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.stripe.paymentMethods.list({
      customer: customerId,
      type,
    });
  }

  async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create(params);
  }

  async createBillingPortalSession(
    params: Stripe.BillingPortal.SessionCreateParams,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create(params);
  }

  async createUsageRecord(
    subscriptionItemId: string,
    quantity: number,
    timestamp?: number,
  ): Promise<Stripe.Billing.MeterEvent> {
    return this.stripe.billing.meterEvents.create({
      event_name: 'usage_record',
      payload: {
        stripe_customer_id: subscriptionItemId,
        value: quantity.toString(),
      },
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
    });
  }

  async listInvoices(customerId: string, limit = 10): Promise<Stripe.ApiList<Stripe.Invoice>> {
    return this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
  }

  async getUpcomingInvoice(customerId: string): Promise<Stripe.Response<Stripe.UpcomingInvoice>> {
    return this.stripe.invoices.createPreview({
      customer: customerId,
    });
  }

  async listPrices(productId?: string, active = true): Promise<Stripe.ApiList<Stripe.Price>> {
    return this.stripe.prices.list({
      product: productId,
      active,
    });
  }

  async listProducts(active = true): Promise<Stripe.ApiList<Stripe.Product>> {
    return this.stripe.products.list({ active });
  }

  constructWebhookEvent(payload: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
