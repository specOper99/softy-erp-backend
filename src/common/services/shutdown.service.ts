import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Received shutdown signal: ${signal}`);

    // Close database connection
    if (this.dataSource.isInitialized) {
      this.logger.log('Closing database connection...');
      await this.dataSource.destroy();
      this.logger.log('Database connection closed.');
    }

    this.logger.log('Graceful shutdown complete.');
  }
}
