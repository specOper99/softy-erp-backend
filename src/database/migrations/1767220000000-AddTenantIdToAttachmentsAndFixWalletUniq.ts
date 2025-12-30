import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToAttachmentsAndFixWalletUniq1767220000000 implements MigrationInterface {
  name = 'AddTenantIdToAttachmentsAndFixWalletUniq1767220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Attachments: add tenant_id for tenant scoping
    const hasAttachmentsTenantId = await queryRunner.hasColumn(
      'attachments',
      'tenant_id',
    );
    if (!hasAttachmentsTenantId) {
      await queryRunner.query(`ALTER TABLE "attachments" ADD "tenant_id" uuid`);
    } else {
      const typeRowsUnknown: unknown = await queryRunner.query(
        `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'attachments' AND column_name = 'tenant_id'`,
      );
      const typeRows = Array.isArray(typeRowsUnknown)
        ? (typeRowsUnknown as Array<{ data_type?: unknown }>)
        : [];
      const dataType =
        typeof typeRows?.[0]?.data_type === 'string'
          ? typeRows[0].data_type
          : undefined;
      if (dataType && dataType !== 'uuid') {
        await queryRunner.query(
          `ALTER TABLE "attachments" ALTER COLUMN "tenant_id" TYPE uuid USING "tenant_id"::uuid`,
        );
      }
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachments_tenant" ON "attachments" ("tenant_id")`,
    );

    // Best-effort backfill from linked booking/task
    await queryRunner.query(`
      UPDATE "attachments" a
      SET "tenant_id" = (
        CASE
          WHEN (b."tenant_id"::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (b."tenant_id"::text)::uuid
          ELSE NULL
        END
      )
      FROM "bookings" b
      WHERE a."tenant_id" IS NULL
        AND a."booking_id" IS NOT NULL
        AND a."booking_id" = b."id"
    `);

    await queryRunner.query(`
      UPDATE "attachments" a
      SET "tenant_id" = (
        CASE
          WHEN (t."tenant_id"::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (t."tenant_id"::text)::uuid
          ELSE NULL
        END
      )
      FROM "tasks" t
      WHERE a."tenant_id" IS NULL
        AND a."task_id" IS NOT NULL
        AND a."task_id" = t."id"
    `);

    // Employee wallets: change uniqueness from global user_id to (tenant_id, user_id)
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" DROP CONSTRAINT IF EXISTS "UQ_employee_wallets_user"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_employee_wallets_tenant_user" ON "employee_wallets" ("tenant_id", "user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_employee_wallets_tenant_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" ADD CONSTRAINT "UQ_employee_wallets_user" UNIQUE ("user_id")`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attachments_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP COLUMN "tenant_id"`,
    );
  }
}
