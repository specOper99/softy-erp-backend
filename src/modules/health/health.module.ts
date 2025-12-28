import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { S3HealthIndicator, SmtpHealthIndicator } from './indicators';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [S3HealthIndicator, SmtpHealthIndicator],
})
export class HealthModule {}
