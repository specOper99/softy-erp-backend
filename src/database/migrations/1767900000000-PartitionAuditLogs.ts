import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartitionAuditLogs1767900000000 implements MigrationInterface {
  name = 'PartitionAuditLogs1767900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME TO "audit_logs_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs_old" RENAME CONSTRAINT "PK_audit_logs" TO "PK_audit_logs_old"`,
    );

    await queryRunner.query(
      `ALTER INDEX IF EXISTS "IDX_audit_logs_hash" RENAME TO "IDX_audit_logs_hash_old"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "IDX_audit_logs_sequence" RENAME TO "IDX_audit_logs_sequence_old"`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying,
        "tenant_id" uuid,
        "action" character varying NOT NULL,
        "entity_name" character varying NOT NULL,
        "entity_id" character varying NOT NULL,
        "old_values" jsonb,
        "new_values" jsonb,
        "notes" text,
        "ip_address" character varying,
        "user_agent" character varying,
        "method" character varying,
        "path" character varying,
        "status_code" integer,
        "duration_ms" integer,
        "hash" character varying(64),
        "previous_hash" character varying(64),
        "sequence_number" bigint,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id", "created_at")
      ) PARTITION BY RANGE ("created_at")
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_tenant_id" ON "audit_logs" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity_id" ON "audit_logs" ("entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_id" ON "audit_logs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_hash" ON "audit_logs" ("hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_sequence" ON "audit_logs" ("tenant_id", "sequence_number")`,
    );

    await queryRunner.query(
      `CREATE TABLE "audit_logs_default" PARTITION OF "audit_logs" DEFAULT`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs_y2024" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_logs_y2025" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_logs_y2026" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')
    `);

    await queryRunner.query(`
       CREATE RULE prevent_audit_update AS ON UPDATE TO "audit_logs" DO INSTEAD NOTHING
    `);

    await queryRunner.query(`
       CREATE RULE prevent_audit_delete AS ON DELETE TO "audit_logs" DO INSTEAD NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "audit_logs" ("id", "user_id", "tenant_id", "action", "entity_name", "entity_id", "old_values", "new_values", "notes", "ip_address", "user_agent", "method", "path", "status_code", "duration_ms", "hash", "previous_hash", "sequence_number", "created_at")
      SELECT "id", "user_id", "tenant_id", "action", "entity_name", "entity_id", "old_values", "new_values", "notes", "ip_address", "user_agent", "method", "path", "status_code", "duration_ms", "hash", "previous_hash", "sequence_number", "created_at" FROM "audit_logs_old"
    `);

    await queryRunner.query(`DROP TABLE "audit_logs_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME TO "audit_logs_partitioned"`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying,
        "tenant_id" uuid,
        "action" character varying NOT NULL,
        "entity_name" character varying NOT NULL,
        "entity_id" character varying NOT NULL,
        "old_values" jsonb,
        "new_values" jsonb,
        "notes" text,
        "ip_address" character varying,
        "user_agent" character varying,
        "method" character varying,
        "path" character varying,
        "status_code" integer,
        "duration_ms" integer,
        "hash" character varying(64),
        "previous_hash" character varying(64),
        "sequence_number" bigint,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_tenant_id" ON "audit_logs" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity_id" ON "audit_logs" ("entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_id" ON "audit_logs" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_hash" ON "audit_logs" ("hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_sequence" ON "audit_logs" ("tenant_id", "sequence_number")`,
    );

    await queryRunner.query(`
       CREATE RULE prevent_audit_update AS ON UPDATE TO "audit_logs" DO INSTEAD NOTHING
    `);
    await queryRunner.query(`
       CREATE RULE prevent_audit_delete AS ON DELETE TO "audit_logs" DO INSTEAD NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "audit_logs" 
      SELECT * FROM "audit_logs_partitioned"
    `);

    await queryRunner.query(`DROP TABLE "audit_logs_partitioned"`);
  }
}
