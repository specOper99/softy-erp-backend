#!/usr/bin/env ts-node
/**
 * Replay dead-lettered (or kill-switch FAILED) outbox events back to PENDING.
 *
 * Usage:
 *   npm run outbox:dlq-replay -- --dry-run
 *   npm run outbox:dlq-replay -- --event-id <uuid>
 *   npm run outbox:dlq-replay -- --limit 50
 *   npm run outbox:dlq-replay -- --reason kill-switch
 *   npm run outbox:dlq-replay -- --reason kill-switch --dry-run
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OutboxEvent, OutboxStatus } from '../src/common/entities/outbox-event.entity';
import { KILL_SWITCH_SKIP_REASON } from '../src/common/services/outbox-relay.service';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const limitIdx = argv.indexOf('--limit');
  const eventIdx = argv.indexOf('--event-id');
  const reasonIdx = argv.indexOf('--reason');
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : 100;
  const eventId = eventIdx >= 0 ? String(argv[eventIdx + 1]) : undefined;
  const reason = reasonIdx >= 0 ? String(argv[reasonIdx + 1]) : undefined;
  return { dryRun, limit, eventId, reason };
}

async function main(): Promise<void> {
  const { dryRun, limit, eventId, reason } = parseArgs(process.argv.slice(2));

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'softy_erp',
    entities: [OutboxEvent],
    synchronize: false,
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(OutboxEvent);

  const killSwitchMode = reason === 'kill-switch';
  const status = killSwitchMode ? OutboxStatus.FAILED : OutboxStatus.DEAD_LETTER;

  const qb = repo
    .createQueryBuilder('event')
    .where('event.status = :status', { status })
    .orderBy(killSwitchMode ? 'event.createdAt' : 'event.deadLetteredAt', 'ASC')
    .take(limit);

  if (killSwitchMode) {
    qb.andWhere('event.error = :error', { error: KILL_SWITCH_SKIP_REASON });
  }

  if (eventId) {
    qb.andWhere('event.id = :eventId', { eventId });
  }

  const rows = await qb.getMany();

  if (rows.length === 0) {
    console.log(
      killSwitchMode ? 'No kill-switch FAILED outbox events matched.' : 'No dead-letter outbox events matched.',
    );
    await dataSource.destroy();
    return;
  }

  console.log(
    `Found ${rows.length} ${killSwitchMode ? 'kill-switch FAILED' : 'dead-letter'} event(s). dryRun=${dryRun}`,
  );

  for (const event of rows) {
    console.log(`- ${event.id} ${event.type} attempts=${event.retryCount} error=${event.error ?? 'n/a'}`);
    if (!dryRun) {
      event.status = OutboxStatus.PENDING;
      event.retryCount = 0;
      event.error = null;
      event.nextAttemptAt = null;
      event.claimedBy = null;
      event.claimLeaseExpiresAt = null;
      event.deadLetteredAt = null;
      await repo.save(event);
    }
  }

  if (dryRun) {
    console.log('Dry run complete — no rows updated.');
  } else {
    console.log(`Replayed ${rows.length} event(s) to PENDING.`);
  }

  await dataSource.destroy();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
