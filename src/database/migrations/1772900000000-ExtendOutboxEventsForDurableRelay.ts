import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends outbox for durable PostgreSQL → BullMQ relay:
 * claim lease, backoff, dispatched/dead-letter metadata, envelope columns, consumer inbox.
 */
export class ExtendOutboxEventsForDurableRelay1772900000000 implements MigrationInterface {
  name = 'ExtendOutboxEventsForDurableRelay1772900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."outbox_events_status_enum" ADD VALUE IF NOT EXISTS 'DISPATCHED';
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."outbox_events_status_enum" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';
    `);

    await queryRunner.query(`
      ALTER TABLE "outbox_events"
        ADD COLUMN IF NOT EXISTS "tenantId" character varying,
        ADD COLUMN IF NOT EXISTS "aggregateType" character varying,
        ADD COLUMN IF NOT EXISTS "eventVersion" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "correlationId" character varying,
        ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "claimedBy" character varying,
        ADD COLUMN IF NOT EXISTS "claimLeaseExpiresAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "deadLetteredAt" TIMESTAMP WITH TIME ZONE;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbox_events_pending_dispatch"
        ON "outbox_events" ("status", "nextAttemptAt", "createdAt")
        WHERE "status" = 'PENDING';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consumer_inbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "consumerName" character varying NOT NULL,
        "eventId" uuid NOT NULL,
        "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consumer_inbox" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consumer_inbox_consumer_event" UNIQUE ("consumerName", "eventId")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_consumer_inbox_eventId"
        ON "consumer_inbox" ("eventId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "consumer_inbox"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outbox_events_pending_dispatch"`);
    await queryRunner.query(`
      ALTER TABLE "outbox_events"
        DROP COLUMN IF EXISTS "deadLetteredAt",
        DROP COLUMN IF EXISTS "dispatchedAt",
        DROP COLUMN IF EXISTS "nextAttemptAt",
        DROP COLUMN IF EXISTS "claimLeaseExpiresAt",
        DROP COLUMN IF EXISTS "claimedBy",
        DROP COLUMN IF EXISTS "occurredAt",
        DROP COLUMN IF EXISTS "correlationId",
        DROP COLUMN IF EXISTS "eventVersion",
        DROP COLUMN IF EXISTS "aggregateType",
        DROP COLUMN IF EXISTS "tenantId";
    `);
  }
}
