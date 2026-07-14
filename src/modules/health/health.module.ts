import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './api/health.controller';
import { CircuitBreakerHealthIndicator, S3HealthIndicator, SmtpHealthIndicator } from './infrastructure/indicators';
import { DatabaseResilienceService } from '../../common/resilience/database-resilience.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [S3HealthIndicator, SmtpHealthIndicator, CircuitBreakerHealthIndicator, DatabaseResilienceService],
  exports: [DatabaseResilienceService],
})
export class HealthModule {}
