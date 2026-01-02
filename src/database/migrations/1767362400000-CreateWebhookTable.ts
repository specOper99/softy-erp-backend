import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookTable1767362400000 implements MigrationInterface {
  name = 'CreateWebhookTable1767362400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhooks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "url" character varying NOT NULL,
        "secret" character varying NOT NULL,
        "events" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhooks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webhooks_tenant" ON "webhooks" ("tenant_id")
    `);

    // Add composite index for tenant isolation (id, tenant_id)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_webhook_composite_tenant"
      ON "webhooks" ("id", "tenant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_webhook_composite_tenant"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_webhooks_tenant"');
    await queryRunner.query('DROP TABLE IF EXISTS "webhooks"');
  }
}
