/**
 * CI smoke: boot Nest AppModule against a migrated DB under production-like env.
 * Catches UndefinedModuleException, prod-blocked MockPaymentGateway, schema enum drift.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { AppModule } from '../../src/app.module';
import { toErrorMessage } from '../../src/common/utils/error.util';
import { patchTypeOrmMigrationOrdering } from '../../src/database/patch-typeorm-migration-order';
import { assertRuntimeSchemaCompatibility } from '../../src/database/runtime-schema-validation';

patchTypeOrmMigrationOrdering();
initializeTransactionalContext();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    fail(`Missing required env ${name} for nest boot smoke.`);
  }
  return value;
}

async function main(): Promise<void> {
  // Force production gates (schema assert + payment gateway resolution).
  process.env.NODE_ENV = 'production';
  process.env.PAYOUT_GATEWAY = process.env.PAYOUT_GATEWAY ?? 'disabled';
  process.env.DB_SYNCHRONIZE = 'false';
  process.env.DB_MIGRATIONS_RUN = 'false';
  process.env.VAULT_ENABLED = process.env.VAULT_ENABLED ?? 'false';
  process.env.OTEL_ENABLED = process.env.OTEL_ENABLED ?? 'false';
  // Rate limiting must stay enabled in production validation.
  delete process.env.DISABLE_RATE_LIMITING;

  requireEnv('JWT_SECRET');
  requireEnv('PLATFORM_JWT_SECRET');
  requireEnv('PASSWORD_RESET_TOKEN_SECRET');
  requireEnv('ENCRYPTION_KEY');
  requireEnv('DB_HOST');
  requireEnv('DB_USERNAME');
  requireEnv('DB_PASSWORD');
  requireEnv('DB_DATABASE');
  requireEnv('REDIS_URL');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    abortOnError: true,
  });

  const dataSource = app.get(DataSource);
  const pending = await dataSource.showMigrations();
  if (pending) {
    fail('PENDING DATABASE MIGRATIONS DETECTED. Run migrations before nest boot smoke.');
  }
  await assertRuntimeSchemaCompatibility(dataSource);
  console.info('Nest boot smoke passed (AppModule + runtime schema).');

  // Do not await graceful shutdown: Bull/Redis keep the loop alive and can throw
  // SocketClosedUnexpectedlyError during close, failing an otherwise green smoke.
  void app.close().catch(() => undefined);
  process.exit(0);
}

main().catch((error) => {
  fail(toErrorMessage(error));
});
