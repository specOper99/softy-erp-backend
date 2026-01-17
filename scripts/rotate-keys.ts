#!/usr/bin/env ts-node

import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { EncryptionService } from '../src/common/services/encryption.service';
import { databaseConfig } from '../src/config';
import { vaultLoader } from '../src/config/vault.loader';
import { KeyRotationService } from '../src/modules/admin/services/key-rotation.service';
import { Webhook } from '../src/modules/webhooks/entities/webhook.entity';

// Load Config
dotenv.config();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [vaultLoader, databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get<Record<string, unknown>>('database') ?? {};
        return {
          type: 'postgres',
          ...dbConfig,
          entities: [Webhook],
          synchronize: false,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Webhook]),
  ],
  providers: [EncryptionService, KeyRotationService],
})
class KeyRotationScriptModule {}

async function run() {
  const logger = new Logger('KeyRotationScript');

  // Validate Environment
  if (!process.env.ENCRYPTION_KEY) {
    logger.error('CRITICAL: ENCRYPTION_KEY is not set.');
    process.exit(1);
  }

  logger.log('Initializing Key Rotation Script...');

  const app = await NestFactory.createApplicationContext(KeyRotationScriptModule);
  const rotationService = app.get(KeyRotationService);
  const encryptionService = app.get(EncryptionService);

  try {
    logger.log(`Current Key Version: ${encryptionService.getCurrentVersion()}`);
    logger.log(`Available Keys: ${encryptionService.getAvailableVersions().join(', ')}`);

    const result = await rotationService.rotateKeys();

    logger.log('--------------------------------------------------');
    logger.log(`Rotation Summary:`);
    logger.log(`✅ Processed/Re-encrypted: ${result.processed}`);
    logger.log(`❌ Errors: ${result.errors}`);
    logger.log('--------------------------------------------------');

    if (result.errors > 0) {
      logger.warn('finished with errors.');
      process.exit(1);
    } else {
      logger.log('Success.');
      process.exit(0);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`Fatal error during rotation: ${message}`, stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

await run();
