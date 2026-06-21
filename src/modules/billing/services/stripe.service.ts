import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

type StripeClient = InstanceType<typeof Stripe>;

@Injectable()
export class StripeService {
  private readonly client: StripeClient | null;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.client = secretKey ? new Stripe(secretKey) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): StripeClient | null {
    return this.client;
  }

  async createCustomer(
    params: Parameters<StripeClient['customers']['create']>[0],
  ): Promise<Awaited<ReturnType<StripeClient['customers']['create']>>> {
    return this.requireClient().customers.create(params);
  }

  async listProducts(
    params?: Parameters<StripeClient['products']['list']>[0],
  ): Promise<Awaited<ReturnType<StripeClient['products']['list']>>> {
    return this.requireClient().products.list(params);
  }

  async listPrices(
    params?: Parameters<StripeClient['prices']['list']>[0],
  ): Promise<Awaited<ReturnType<StripeClient['prices']['list']>>> {
    return this.requireClient().prices.list(params);
  }

  async listInvoices(
    params?: Parameters<StripeClient['invoices']['list']>[0],
  ): Promise<Awaited<ReturnType<StripeClient['invoices']['list']>>> {
    return this.requireClient().invoices.list(params);
  }

  async createCheckoutSession(
    params: Parameters<StripeClient['checkout']['sessions']['create']>[0],
  ): Promise<Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>> {
    return this.requireClient().checkout.sessions.create(params);
  }

  async createBillingPortalSession(
    params: Parameters<StripeClient['billingPortal']['sessions']['create']>[0],
  ): Promise<Awaited<ReturnType<StripeClient['billingPortal']['sessions']['create']>>> {
    return this.requireClient().billingPortal.sessions.create(params);
  }

  private requireClient(): StripeClient {
    if (!this.client) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.');
    }

    return this.client;
  }
}
