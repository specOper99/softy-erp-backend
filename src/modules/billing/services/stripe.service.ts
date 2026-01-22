import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeService.name);
  private loggedDisabledWarning = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured - billing features disabled');
      this.stripe = null;
      return;
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });
  }

  private getStripeClientOrThrow(): Stripe {
    if (this.stripe) return this.stripe;

    if (!this.loggedDisabledWarning) {
      this.logger.warn('Stripe client requested but STRIPE_SECRET_KEY is not configured');
      this.loggedDisabledWarning = true;
    }

    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.');
  }

  getClient(): Stripe | null {
    return this.stripe;
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async createCustomer(params: Stripe.CustomerCreateParams): Promise<Stripe.Customer> {
    return this.getStripeClientOrThrow().customers.create(params);
  }

  async updateCustomer(customerId: string, params: Stripe.CustomerUpdateParams): Promise<Stripe.Customer> {
    return this.getStripeClientOrThrow().customers.update(customerId, params);
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    return this.getStripeClientOrThrow().customers.del(customerId);
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.getStripeClientOrThrow().customers.retrieve(customerId);
  }

  async createSubscription(params: Stripe.SubscriptionCreateParams): Promise<Stripe.Subscription> {
    return this.getStripeClientOrThrow().subscriptions.create(params);
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.getStripeClientOrThrow().subscriptions.update(subscriptionId, params);
  }

  async cancelSubscription(
    subscriptionId: string,
    params?: Stripe.SubscriptionCancelParams,
  ): Promise<Stripe.Subscription> {
    return this.getStripeClientOrThrow().subscriptions.cancel(subscriptionId, params);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.getStripeClientOrThrow().subscriptions.retrieve(subscriptionId);
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<Stripe.PaymentMethod> {
    return this.getStripeClientOrThrow().paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.getStripeClientOrThrow().paymentMethods.detach(paymentMethodId);
  }

  async listPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethodListParams.Type = 'card',
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.getStripeClientOrThrow().paymentMethods.list({
      customer: customerId,
      type,
    });
  }

  async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session> {
    return this.getStripeClientOrThrow().checkout.sessions.create(params);
  }

  async createBillingPortalSession(
    params: Stripe.BillingPortal.SessionCreateParams,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.getStripeClientOrThrow().billingPortal.sessions.create(params);
  }

  async createUsageRecord(
    subscriptionItemId: string,
    quantity: number,
    timestamp?: number,
  ): Promise<Stripe.Billing.MeterEvent> {
    return this.getStripeClientOrThrow().billing.meterEvents.create({
      event_name: 'usage_record',
      payload: {
        stripe_customer_id: subscriptionItemId,
        value: quantity.toString(),
      },
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
    });
  }

  async listInvoices(customerId: string, limit = 10): Promise<Stripe.ApiList<Stripe.Invoice>> {
    return this.getStripeClientOrThrow().invoices.list({
      customer: customerId,
      limit,
    });
  }

  async getUpcomingInvoice(customerId: string): Promise<Stripe.Response<Stripe.UpcomingInvoice>> {
    return this.getStripeClientOrThrow().invoices.createPreview({
      customer: customerId,
    });
  }

  async listPrices(productId?: string, active = true): Promise<Stripe.ApiList<Stripe.Price>> {
    return this.getStripeClientOrThrow().prices.list({
      product: productId,
      active,
    });
  }

  async listProducts(active = true): Promise<Stripe.ApiList<Stripe.Product>> {
    return this.getStripeClientOrThrow().products.list({ active });
  }

  constructWebhookEvent(payload: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.getStripeClientOrThrow().webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
