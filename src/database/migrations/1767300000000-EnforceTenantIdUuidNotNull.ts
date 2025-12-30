import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceTenantIdUuidNotNull1767300000000 implements MigrationInterface {
  name = 'EnforceTenantIdUuidNotNull1767300000000';

  private readonly uuidRegex =
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  private async getTenantIdDataType(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<string | undefined> {
    const rowsUnknown: unknown = await queryRunner.query(
      `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
      [table],
    );

    const rows = Array.isArray(rowsUnknown)
      ? (rowsUnknown as Array<{ data_type?: unknown }>)
      : [];
    return typeof rows?.[0]?.data_type === 'string'
      ? rows[0].data_type
      : undefined;
  }

  private async assertNoNullTenantId(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    const rowsUnknown: unknown = await queryRunner.query(
      `SELECT COUNT(*)::text as count FROM "${table}" WHERE "tenant_id" IS NULL`,
    );
    const rows = Array.isArray(rowsUnknown)
      ? (rowsUnknown as Array<{ count?: unknown }>)
      : [];
    const countText = rows?.[0]?.count;
    const count = typeof countText === 'string' ? Number(countText) : 0;
    if (count > 0) {
      throw new Error(
        `Cannot enforce tenant ownership: ${table}.tenant_id has ${count} NULL rows`,
      );
    }
  }

  private async assertNoInvalidTenantId(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    const rowsUnknown: unknown = await queryRunner.query(
      `SELECT COUNT(*)::text as count FROM "${table}" WHERE "tenant_id" IS NOT NULL AND ("tenant_id"::text) !~* '${this.uuidRegex}'`,
    );
    const rows = Array.isArray(rowsUnknown)
      ? (rowsUnknown as Array<{ count?: unknown }>)
      : [];
    const countText = rows?.[0]?.count;
    const count = typeof countText === 'string' ? Number(countText) : 0;
    if (count > 0) {
      throw new Error(
        `Cannot convert ${table}.tenant_id to uuid: ${count} rows are not valid UUIDs`,
      );
    }
  }

  private async ensureTenantIdUuidNotNull(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    const hasTenantId = await queryRunner.hasColumn(table, 'tenant_id');
    if (!hasTenantId) {
      return;
    }

    const dataType = await this.getTenantIdDataType(queryRunner, table);

    if (dataType && dataType !== 'uuid') {
      await this.assertNoInvalidTenantId(queryRunner, table);
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid USING ("tenant_id"::text)::uuid`,
      );
    }

    await this.assertNoNullTenantId(queryRunner, table);
    await queryRunner.query(
      `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" SET NOT NULL`,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill profile tenant_id from user tenant_id (then normalize)
    if (await queryRunner.hasColumn('profiles', 'tenant_id')) {
      await queryRunner.query(`
        UPDATE "profiles" p
        SET "tenant_id" = u."tenant_id"::text
        FROM "users" u
        WHERE p."user_id" = u."id"
          AND (p."tenant_id" IS NULL OR p."tenant_id"::text = '')
      `);
    }

    // Backfill attachment tenant_id from booking/task when missing (then enforce NOT NULL)
    if (await queryRunner.hasColumn('attachments', 'tenant_id')) {
      await queryRunner.query(`
        UPDATE "attachments" a
        SET "tenant_id" = (
          CASE
            WHEN (b."tenant_id"::text) ~* '${this.uuidRegex}' THEN (b."tenant_id"::text)::uuid
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
            WHEN (t."tenant_id"::text) ~* '${this.uuidRegex}' THEN (t."tenant_id"::text)::uuid
            ELSE NULL
          END
        )
        FROM "tasks" t
        WHERE a."tenant_id" IS NULL
          AND a."task_id" IS NOT NULL
          AND a."task_id" = t."id"
      `);
    }

    // Normalize/enforce tenant_id across all tenant-scoped tables
    const tables = [
      'users',
      'profiles',
      'employee_wallets',
      'task_types',
      'package_items',
      'service_packages',
      'bookings',
      'tasks',
      'transactions',
      'attachments',
    ];

    for (const table of tables) {
      await this.ensureTenantIdUuidNotNull(queryRunner, table);
    }

    // Helpful indexes (idempotent) for newly-enforced tables
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_profiles_tenant" ON "profiles" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachments_tenant" ON "attachments" ("tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Do not attempt to revert normalization, only remove added indexes.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_profiles_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attachments_tenant"`,
    );
  }
}
