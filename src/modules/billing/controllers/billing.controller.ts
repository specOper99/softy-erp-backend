import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateCheckoutSessionDto,
  CreatePortalSessionDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from '../dto/billing.dto';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('billing.tenant_required');
    }
    return tenantId;
  }

  @Get('subscription')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get current subscription' })
  async getSubscription() {
    const tenantId = this.getTenantIdOrThrow();
    return this.subscriptionService.getSubscription(tenantId);
  }

  @Post('subscription')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new subscription' })
  async createSubscription(@Body() dto: CreateSubscriptionDto) {
    const tenantId = this.getTenantIdOrThrow();
    return this.subscriptionService.createSubscription(tenantId, dto.priceId, dto.paymentMethodId);
  }

  @Delete('subscription')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cancel subscription' })
  async cancelSubscription(@Body() dto: UpdateSubscriptionDto) {
    const tenantId = this.getTenantIdOrThrow();
    const cancelImmediately = !dto.cancelAtPeriodEnd;
    return this.subscriptionService.cancelSubscription(tenantId, cancelImmediately);
  }

  @Post('checkout-session')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create Stripe Checkout session' })
  async createCheckoutSession(@Body() dto: CreateCheckoutSessionDto) {
    const tenantId = this.getTenantIdOrThrow();
    const customer = await this.subscriptionService.getOrCreateCustomer(tenantId);

    const session = await this.stripeService.createCheckoutSession({
      customer: customer.stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: dto.priceId, quantity: 1 }],
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      allow_promotion_codes: dto.allowPromotionCodes,
    });

    return { sessionId: session.id, url: session.url };
  }

  @Post('portal-session')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create Stripe Customer Portal session' })
  async createPortalSession(@Body() dto: CreatePortalSessionDto) {
    const tenantId = this.getTenantIdOrThrow();
    const customer = await this.subscriptionService.getOrCreateCustomer(tenantId);

    const session = await this.stripeService.createBillingPortalSession({
      customer: customer.stripeCustomerId,
      return_url: dto.returnUrl,
    });

    return { url: session.url };
  }

  @Get('invoices')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List invoices' })
  async listInvoices() {
    const tenantId = this.getTenantIdOrThrow();
    const customer = await this.subscriptionService.getOrCreateCustomer(tenantId);
    return this.stripeService.listInvoices(customer.stripeCustomerId);
  }

  @Get('upcoming-invoice')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get upcoming invoice preview' })
  async getUpcomingInvoice() {
    const tenantId = this.getTenantIdOrThrow();
    const customer = await this.subscriptionService.getOrCreateCustomer(tenantId);
    return this.stripeService.getUpcomingInvoice(customer.stripeCustomerId);
  }

  @Get('prices')
  @ApiOperation({ summary: 'List available subscription prices' })
  async listPrices() {
    return this.stripeService.listPrices();
  }

  @Get('products')
  @ApiOperation({ summary: 'List available products' })
  async listProducts() {
    return this.stripeService.listProducts();
  }
}

@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request> & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('billing.stripe_config_error');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('billing.raw_body_error');
    }

    const event = this.stripeService.constructWebhookEvent(rawBody, signature, webhookSecret);

    await this.subscriptionService.handleWebhookEvent(event);

    return { received: true };
  }
}
