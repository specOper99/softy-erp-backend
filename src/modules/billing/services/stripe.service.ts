import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type StripeClient = ReturnType<typeof Stripe>;
export type StripeCustomerCreateParams = Parameters<StripeClient['customers']['create']>[0];
export type StripeCustomerUpdateParams = Parameters<StripeClient['customers']['update']>[1];
export type StripeCustomer = Awaited<ReturnType<StripeClient['customers']['create']>>;
export type StripeDeletedCustomer = Awaited<ReturnType<StripeClient['customers']['del']>>;
export type StripeCustomerRecord = Awaited<ReturnType<StripeClient['customers']['retrieve']>>;
export type StripeSubscriptionCreateParams = Parameters<StripeClient['subscriptions']['create']>[0];
export type StripeSubscriptionUpdateParams = Parameters<StripeClient['subscriptions']['update']>[1];
export type StripeSubscriptionCancelParams = Parameters<StripeClient['subscriptions']['cancel']>[1];
export type StripeSubscription = Awaited<ReturnType<StripeClient['subscriptions']['create']>>;
export type StripePaymentMethod = Awaited<ReturnType<StripeClient['paymentMethods']['attach']>>;
export type StripePaymentMethodListParams = Parameters<StripeClient['paymentMethods']['list']>[0];
export type StripePaymentMethodList = Awaited<ReturnType<StripeClient['paymentMethods']['list']>>;
export type StripeCheckoutSessionCreateParams = Parameters<StripeClient['checkout']['sessions']['create']>[0];
export type StripeCheckoutSession = Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>;
export type StripeBillingPortalSessionCreateParams = Parameters<StripeClient['billingPortal']['sessions']['create']>[0];
export type StripeBillingPortalSession = Awaited<ReturnType<StripeClient['billingPortal']['sessions']['create']>>;
export type StripeMeterEvent = Awaited<ReturnType<StripeClient['billing']['meterEvents']['create']>>;
export type StripeInvoiceList = Awaited<ReturnType<StripeClient['invoices']['list']>>;
export type StripeInvoice = StripeInvoiceList['data'][number];
export type StripeUpcomingInvoice = Awaited<ReturnType<StripeClient['invoices']['createPreview']>>;
export type StripePriceList = Awaited<ReturnType<StripeClient['prices']['list']>>;
export type StripePrice = StripePriceList['data'][number];
export type StripeProductList = Awaited<ReturnType<StripeClient['products']['list']>>;
export type StripeProduct = StripeProductList['data'][number];
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: StripeClient | null = null;
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
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    });
  }

  private getStripeClientOrThrow(): StripeClient {
    if (this.stripe) return this.stripe;

    if (!this.loggedDisabledWarning) {
      this.logger.warn('Stripe client requested but STRIPE_SECRET_KEY is not configured');
      this.loggedDisabledWarning = true;
    }

    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.');
  }

  getClient(): StripeClient | null {
    return this.stripe;
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async createCustomer(params: StripeCustomerCreateParams): Promise<StripeCustomer> {
    return this.getStripeClientOrThrow().customers.create(params);
  }

  async updateCustomer(customerId: string, params: StripeCustomerUpdateParams): Promise<StripeCustomer> {
    return this.getStripeClientOrThrow().customers.update(customerId, params);
  }

  async deleteCustomer(customerId: string): Promise<StripeDeletedCustomer> {
    return this.getStripeClientOrThrow().customers.del(customerId);
  }

  async getCustomer(customerId: string): Promise<StripeCustomerRecord> {
    return this.getStripeClientOrThrow().customers.retrieve(customerId);
  }

  async createSubscription(
    params: StripeSubscriptionCreateParams,
    idempotencyKey?: string,
  ): Promise<StripeSubscription> {
    return this.getStripeClientOrThrow().subscriptions.create(params, idempotencyKey ? { idempotencyKey } : undefined);
  }

  async updateSubscription(
    subscriptionId: string,
    params: StripeSubscriptionUpdateParams,
  ): Promise<StripeSubscription> {
    return this.getStripeClientOrThrow().subscriptions.update(subscriptionId, params);
  }

  async cancelSubscription(
    subscriptionId: string,
    params?: StripeSubscriptionCancelParams,
  ): Promise<StripeSubscription> {
    return this.getStripeClientOrThrow().subscriptions.cancel(subscriptionId, params);
  }

  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.getStripeClientOrThrow().subscriptions.retrieve(subscriptionId);
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<StripePaymentMethod> {
    return this.getStripeClientOrThrow().paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<StripePaymentMethod> {
    return this.getStripeClientOrThrow().paymentMethods.detach(paymentMethodId);
  }

  async listPaymentMethods(
    customerId: string,
    type: NonNullable<StripePaymentMethodListParams>['type'] = 'card',
  ): Promise<StripePaymentMethodList> {
    return this.getStripeClientOrThrow().paymentMethods.list({
      customer: customerId,
      type,
    });
  }

  async createCheckoutSession(params: StripeCheckoutSessionCreateParams): Promise<StripeCheckoutSession> {
    return this.getStripeClientOrThrow().checkout.sessions.create(params);
  }

  async createBillingPortalSession(
    params: StripeBillingPortalSessionCreateParams,
  ): Promise<StripeBillingPortalSession> {
    return this.getStripeClientOrThrow().billingPortal.sessions.create(params);
  }

  async createUsageRecord(subscriptionItemId: string, quantity: number, timestamp?: number): Promise<StripeMeterEvent> {
    return this.getStripeClientOrThrow().billing.meterEvents.create({
      event_name: 'usage_record',
      payload: {
        stripe_customer_id: subscriptionItemId,
        value: quantity.toString(),
      },
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
    });
  }

  async listInvoices(customerId: string, limit = 10): Promise<StripeInvoiceList> {
    return this.getStripeClientOrThrow().invoices.list({
      customer: customerId,
      limit,
    });
  }

  async getUpcomingInvoice(customerId: string): Promise<StripeUpcomingInvoice> {
    return this.getStripeClientOrThrow().invoices.createPreview({
      customer: customerId,
    });
  }

  async listPrices(productId?: string, active = true): Promise<StripePriceList> {
    return this.getStripeClientOrThrow().prices.list({
      product: productId,
      active,
    });
  }

  async listProducts(active = true): Promise<StripeProductList> {
    return this.getStripeClientOrThrow().products.list({ active });
  }

  constructWebhookEvent(payload: Buffer, signature: string, webhookSecret: string): StripeEvent {
    return this.getStripeClientOrThrow().webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
