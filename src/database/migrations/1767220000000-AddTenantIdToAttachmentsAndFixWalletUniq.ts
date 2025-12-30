import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToAttachmentsAndFixWalletUniq1767220000000 implements MigrationInterface {
  name = 'AddTenantIdToAttachmentsAndFixWalletUniq1767220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Attachments: add tenant_id for tenant scoping
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD "tenant_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_tenant" ON "attachments" ("tenant_id")`,
    );

    // Best-effort backfill from linked booking/task
    await queryRunner.query(`
      UPDATE "attachments" a
      SET "tenant_id" = b."tenant_id"::text
      FROM "bookings" b
      WHERE a."tenant_id" IS NULL
        AND a."booking_id" IS NOT NULL
        AND a."booking_id" = b."id"
    `);

    await queryRunner.query(`
      UPDATE "attachments" a
      SET "tenant_id" = t."tenant_id"::text
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
      `CREATE UNIQUE INDEX "IDX_employee_wallets_tenant_user" ON "employee_wallets" ("tenant_id", "user_id")`,
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
