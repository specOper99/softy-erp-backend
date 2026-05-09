import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { BillingCustomer } from '../entities/billing-customer.entity';
import { BillingWebhookEvent } from '../entities/billing-webhook-event.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { BillingInterval, Subscription, SubscriptionStatus } from '../entities/subscription.entity';
import {
  type StripeEvent,
  type StripeInvoice,
  type StripeSubscription,
  type StripeSubscriptionCreateParams,
  StripeService,
} from './stripe.service';

interface StripeSubscriptionWithPeriod extends StripeSubscription {
  current_period_start: number;
  current_period_end: number;
}

interface StripeInvoiceWithExpandedSubscription extends StripeInvoice {
  subscription: string | StripeSubscription | null;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  /**
   * Explicit price-ID → plan mapping loaded from config.
   * Using substring matching (priceId.includes('enterprise')) is unsafe —
   * a price like 'not-enterprise' or a typo in the Stripe dashboard would
   * silently mis-assign the plan. Instead we require exact price-ID env vars.
   */
  private readonly priceToplan: ReadonlyMap<string, SubscriptionPlan>;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(BillingCustomer)
    private readonly customerRepo: Repository<BillingCustomer>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(BillingWebhookEvent)
    private readonly webhookEventRepo: Repository<BillingWebhookEvent>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {
    const map = new Map<string, SubscriptionPlan>();
    const enterpriseId = this.configService.get<string>('STRIPE_PRICE_ENTERPRISE');
    const proId = this.configService.get<string>('STRIPE_PRICE_PRO');
    if (enterpriseId) map.set(enterpriseId, SubscriptionPlan.ENTERPRISE);
    if (proId) map.set(proId, SubscriptionPlan.PRO);
    this.priceToplan = map;
  }

  async getOrCreateCustomer(tenantId: string): Promise<BillingCustomer> {
    let customer = await this.customerRepo.findOne({ where: { tenantId } });
    if (customer) return customer;

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'platform.tenant_not_found',
        args: { tenantId },
      });
    }

    let stripeCustomer: Awaited<ReturnType<StripeService['createCustomer']>>;
    try {
      stripeCustomer = await this.stripeService.createCustomer({
        name: tenant.name,
        metadata: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
        },
      });
    } catch (stripeError) {
      this.logger.error(`Failed to create Stripe customer for tenant ${tenantId}`, stripeError);
      throw new ServiceUnavailableException('billing.stripe_unavailable');
    }

    customer = this.customerRepo.create({
      tenantId,
      stripeCustomerId: stripeCustomer.id,
      name: tenant.name,
    });

    return this.customerRepo.save(customer);
  }

  async createSubscription(tenantId: string, priceId: string, paymentMethodId?: string): Promise<Subscription> {
    const customer = await this.getOrCreateCustomer(tenantId);

    const existingSub = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });
    if (existingSub?.isActive()) {
      throw new BadRequestException('tenants.subscription_active_exists');
    }

    const params: StripeSubscriptionCreateParams = {
      customer: customer.stripeCustomerId,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
    };

    if (paymentMethodId) {
      params.default_payment_method = paymentMethodId;
    }

    // Use a tenant-scoped idempotency key so Stripe won't create duplicate subscriptions
    // if two concurrent requests slip through the isActive() guard above.
    const stripeSubscription = await this.stripeService.createSubscription(params, `sub-create-${tenantId}`);

    const subscription = this.subscriptionRepo.create({
      tenantId,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: customer.stripeCustomerId,
      stripePriceId: priceId,
      status: this.mapStripeStatus(stripeSubscription.status),
      billingInterval: this.mapInterval(
        (stripeSubscription.items.data[0]?.price.recurring?.interval as string) ?? 'month',
      ),
      currentPeriodStart: new Date(
        ((stripeSubscription as unknown as StripeSubscriptionWithPeriod).current_period_start || 0) * 1000,
      ),
      currentPeriodEnd: new Date(
        ((stripeSubscription as unknown as StripeSubscriptionWithPeriod).current_period_end || 0) * 1000,
      ),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      quantity: stripeSubscription.items.data[0]?.quantity ?? 1,
    });

    let saved: Subscription;
    try {
      saved = await this.subscriptionRepo.save(subscription);
    } catch (dbError) {
      // Stripe subscription was created but DB save failed — attempt to roll back
      // the Stripe side to avoid a dangling paid subscription with no local record.
      this.logger.error(
        `DB save failed after Stripe subscription ${stripeSubscription.id} was created. Attempting Stripe cancellation.`,
        dbError,
      );
      try {
        await this.stripeService.cancelSubscription(stripeSubscription.id);
      } catch (cancelError) {
        this.logger.error(
          `Failed to cancel dangling Stripe subscription ${stripeSubscription.id}. Manual cleanup required.`,
          cancelError,
        );
      }
      throw dbError;
    }

    await this.updateTenantPlan(tenantId, priceId);

    return saved;
  }

  async cancelSubscription(tenantId: string, cancelImmediately = false): Promise<Subscription> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });
    if (!subscription) {
      throw new NotFoundException('billing.subscription_none_for_tenant');
    }

    try {
      if (cancelImmediately) {
        await this.stripeService.cancelSubscription(subscription.stripeSubscriptionId);
        subscription.status = SubscriptionStatus.CANCELED;
        subscription.canceledAt = new Date();
      } else {
        await this.stripeService.updateSubscription(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
        subscription.cancelAtPeriodEnd = true;
      }
    } catch (stripeError) {
      this.logger.error(
        `Failed to cancel Stripe subscription ${subscription.stripeSubscriptionId} for tenant ${tenantId}`,
        stripeError,
      );
      throw new ServiceUnavailableException('billing.stripe_unavailable');
    }

    return this.subscriptionRepo.save(subscription);
  }

  async getSubscription(tenantId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({ where: { tenantId } });
  }

  async handleWebhookEvent(event: StripeEvent): Promise<void> {
    const alreadyProcessed = await this.hasWebhookEventProcessed('stripe', event.id);
    if (alreadyProcessed) {
      this.logger.warn(`Skipping duplicate webhook event: ${event.id}`);
      return;
    }

    this.logger.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.syncSubscriptionFromStripe(event.data.object as StripeSubscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as StripeSubscription);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as StripeInvoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as StripeInvoice);
        break;

      default:
        this.logger.debug(`Unhandled webhook event type: ${event.type}`);
    }

    const markedProcessed = await this.markWebhookEventProcessed('stripe', event.id);
    if (!markedProcessed) {
      this.logger.warn(`Webhook event was processed concurrently by another worker: ${event.id}`);
    }
  }

  private async syncSubscriptionFromStripe(stripeSub: StripeSubscription): Promise<void> {
    const stripeCustomerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id;

    if (!stripeCustomerId) {
      this.logger.error(`Stripe subscription ${stripeSub.id} has no customer ID`);
      return;
    }

    const customer = await this.customerRepo.findOne({
      where: { stripeCustomerId },
    });
    if (!customer) {
      this.logger.warn(`Customer not found for Stripe subscription: ${stripeSub.id}`);
      return;
    }

    let subscription = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: stripeSub.id },
    });

    const priceId = stripeSub.items.data[0]?.price.id;
    if (!priceId) {
      this.logger.warn(`Stripe subscription ${stripeSub.id} has no price ID`);
      if (!subscription) return;
    }

    if (!subscription) {
      subscription = this.subscriptionRepo.create({
        tenantId: customer.tenantId,
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: customer.stripeCustomerId,
        stripePriceId: priceId,
      });
    } else if (priceId) {
      subscription.stripePriceId = priceId;
    }

    subscription.status = this.mapStripeStatus(stripeSub.status);

    const subWithPeriod = stripeSub as StripeSubscriptionWithPeriod;
    if (!subWithPeriod.current_period_start || !subWithPeriod.current_period_end) {
      this.logger.warn(`Stripe subscription missing period fields: ${stripeSub.id}`);
      return;
    }

    subscription.currentPeriodStart = new Date(subWithPeriod.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(subWithPeriod.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
    subscription.canceledAt = stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null;

    await this.subscriptionRepo.save(subscription);
  }

  private async handleSubscriptionDeleted(stripeSub: StripeSubscription): Promise<void> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: stripeSub.id },
    });
    if (!subscription) return;

    subscription.status = SubscriptionStatus.CANCELED;
    subscription.canceledAt = new Date();
    await this.subscriptionRepo.save(subscription);

    await this.tenantRepo.update(subscription.tenantId, {
      subscriptionPlan: SubscriptionPlan.FREE,
    });
  }

  private async handlePaymentSucceeded(invoice: StripeInvoice): Promise<void> {
    const subscription = await this.getSubscriptionFromInvoice(invoice);
    if (!subscription) return;

    if (subscription.status === SubscriptionStatus.PAST_DUE) {
      subscription.status = SubscriptionStatus.ACTIVE;
      await this.subscriptionRepo.save(subscription);
    }
  }

  private async handlePaymentFailed(invoice: StripeInvoice): Promise<void> {
    const subscription = await this.getSubscriptionFromInvoice(invoice);
    if (!subscription) return;

    subscription.status = SubscriptionStatus.PAST_DUE;
    await this.subscriptionRepo.save(subscription);
  }

  private async getSubscriptionFromInvoice(invoice: StripeInvoice): Promise<Subscription | null> {
    const sub = (invoice as unknown as StripeInvoiceWithExpandedSubscription).subscription;

    if (!sub) return null;

    const subscriptionId = typeof sub === 'string' ? sub : sub.id;

    return this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: subscriptionId },
    });
  }

  private async updateTenantPlan(tenantId: string, priceId: string): Promise<void> {
    const plan = this.mapPriceToSubscriptionPlan(priceId);
    await this.tenantRepo.update(tenantId, { subscriptionPlan: plan });
  }

  private mapStripeStatus(status: StripeSubscription['status']): SubscriptionStatus {
    const mapping: Record<StripeSubscription['status'], SubscriptionStatus> = {
      trialing: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      paused: SubscriptionStatus.PAUSED,
    };
    return mapping[status] ?? SubscriptionStatus.INCOMPLETE;
  }

  private mapInterval(interval: string): BillingInterval {
    return interval === 'year' ? BillingInterval.YEAR : BillingInterval.MONTH;
  }

  private mapPriceToSubscriptionPlan(priceId: string): SubscriptionPlan {
    return this.priceToplan.get(priceId) ?? SubscriptionPlan.FREE;
  }

  private async hasWebhookEventProcessed(provider: string, eventId: string): Promise<boolean> {
    const existing = await this.webhookEventRepo.findOne({
      where: { provider, eventId },
      select: ['id'],
    });
    return Boolean(existing);
  }

  private async markWebhookEventProcessed(provider: string, eventId: string): Promise<boolean> {
    try {
      await this.webhookEventRepo.insert(
        this.webhookEventRepo.create({
          provider,
          eventId,
        }),
      );
      return true;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
        return false;
      }
      throw error;
    }
  }
}
