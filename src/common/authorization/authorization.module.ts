import { Global, Module } from '@nestjs/common';
import { MetricsModule } from '../../modules/metrics/metrics.module';
import { AbilityFactory } from './ability.factory';
import { AbilityGuard } from './ability.guard';
import { CaslShadowMetric } from './casl-shadow.metric';
import { ResourceOwnershipGuard } from '../guards/resource-ownership.guard';

@Global()
@Module({
  imports: [MetricsModule],
  providers: [AbilityFactory, AbilityGuard, CaslShadowMetric, ResourceOwnershipGuard],
  exports: [AbilityFactory, AbilityGuard, CaslShadowMetric, ResourceOwnershipGuard],
})
export class AuthorizationModule {}
