import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TenantsController } from './api/tenants.controller';
import { TenantsService } from './application/tenants.service';
import { Tenant } from './domain/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), CommonModule, MetricsModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
