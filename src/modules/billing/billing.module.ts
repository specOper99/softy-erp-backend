import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { BillingController, BillingWebhookController } from './controllers/billing.controller';
import { BillingCustomer, BillingWebhookEvent, PaymentMethod, Subscription, UsageRecord } from './entities';
import { UsageRecordRepository } from './repositories/usage-record.repository';
import { MeteringService, StripeService, SubscriptionReconcileService, SubscriptionService } from './services';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Subscription, BillingCustomer, PaymentMethod, UsageRecord, BillingWebhookEvent, Tenant]),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [StripeService, SubscriptionService, SubscriptionReconcileService, MeteringService, UsageRecordRepository],
  exports: [StripeService, SubscriptionService, MeteringService],
})
export class BillingModule {}
