import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, initialize, Unleash } from 'unleash-client';

@Injectable()
export class FlagsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlagsService.name);
  private unleashInstance!: Unleash;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const unleashUrl = this.configService.get<string>('UNLEASH_URL');
    const unleashToken = this.configService.get<string>('UNLEASH_API_TOKEN');
    const appName = this.configService.get<string>('SERVICE_NAME', 'softy-erp');

    if (!unleashUrl || !unleashToken) {
      this.logger.warn('Unleash URL or Token not provided. Feature flags will default to false.');
      return;
    }

    this.unleashInstance = initialize({
      url: unleashUrl,
      appName: appName,
      customHeaders: { Authorization: unleashToken },
      // Refresh toggles every 30s
      refreshInterval: 30000,
    });

    this.unleashInstance.on('synchronized', () => {
      this.logger.debug('Unleash client synchronized.');
    });

    this.unleashInstance.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Unleash client error: ${message}`);
    });
  }

  onModuleDestroy() {
    if (this.unleashInstance) {
      this.unleashInstance.destroy();
    }
  }

  /**
   * Check if a feature flag is enabled.
   * @param feature The name of the feature toggle.
   * @param context Optional context (userId, tenantId, etc.) for strategy evaluation.
   * @param defaultValue Default value if Unleash is down (default: false).
   */
  isEnabled(feature: string, context: Context = {}, defaultValue = false): boolean {
    if (!this.unleashInstance) {
      return defaultValue;
    }
    return this.unleashInstance.isEnabled(feature, context, defaultValue);
  }
}
