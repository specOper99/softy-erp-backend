import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController, BillingWebhookController } from './controllers/billing.controller';
import { BillingCustomer, PaymentMethod, Subscription, UsageRecord } from './entities';
import { MeteringService, StripeService, SubscriptionService } from './services';
import { Tenant } from '../tenants/entities/tenant.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Subscription, BillingCustomer, PaymentMethod, UsageRecord, Tenant]),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [StripeService, SubscriptionService, MeteringService],
  exports: [StripeService, SubscriptionService, MeteringService],
})
export class BillingModule {}
