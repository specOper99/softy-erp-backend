import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AlignTenantScopedPreferences1771500000001 implements MigrationInterface {
  name = 'AlignTenantScopedPreferences1771500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.alignUserPreferencesTenantScope(queryRunner);
    await this.ensureNotificationPreferencesTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('user_preferences')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_preferences_tenant_id"`);

      if (await queryRunner.hasColumn('user_preferences', 'tenant_id')) {
        await queryRunner.query(`ALTER TABLE "user_preferences" ALTER COLUMN "tenant_id" DROP NOT NULL`);
      }
    }
  }

  private async alignUserPreferencesTenantScope(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user_preferences'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('user_preferences', 'tenant_id'))) {
      await queryRunner.addColumn(
        'user_preferences',
        new TableColumn({
          name: 'tenant_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    await queryRunner.query(`
      UPDATE "user_preferences" up
      SET "tenant_id" = u."tenant_id"
      FROM "users" u
      WHERE up."user_id" = u."id"
        AND up."tenant_id" IS NULL
    `);

    const nullTenantRowsUnknown: unknown = await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM "user_preferences"
      WHERE "tenant_id" IS NULL
    `);

    const nullTenantRows = Array.isArray(nullTenantRowsUnknown)
      ? (nullTenantRowsUnknown as Array<{ count?: number | string }>)
      : [];
    const unresolvedCount = Number(nullTenantRows[0]?.count ?? 0);

    if (unresolvedCount > 0) {
      throw new Error(
        `Cannot enforce NOT NULL on user_preferences.tenant_id. ${unresolvedCount} row(s) could not be backfilled from users.`,
      );
    }

    await queryRunner.query(`ALTER TABLE "user_preferences" ALTER COLUMN "tenant_id" SET NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_preferences_tenant_id" ON "user_preferences" ("tenant_id")`,
    );
  }

  private async ensureNotificationPreferencesTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notification_preferences_notification_type_enum'
            AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "public"."notification_preferences_notification_type_enum" AS ENUM(
            'BOOKING_CREATED',
            'BOOKING_UPDATED',
            'BOOKING_CANCELLED',
            'TASK_ASSIGNED',
            'TASK_COMPLETED',
            'PAYMENT_RECEIVED',
            'SYSTEM_ALERT'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notification_preferences_frequency_enum'
            AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "public"."notification_preferences_frequency_enum" AS ENUM(
            'IMMEDIATE',
            'DAILY_DIGEST',
            'NONE'
          );
        END IF;
      END
      $$;
    `);

    if (!(await queryRunner.hasTable('notification_preferences'))) {
      await queryRunner.query(`
        CREATE TABLE "notification_preferences" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "tenant_id" uuid NOT NULL,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "user_id" uuid NOT NULL,
          "notification_type" "public"."notification_preferences_notification_type_enum" NOT NULL,
          "email_enabled" boolean NOT NULL DEFAULT true,
          "in_app_enabled" boolean NOT NULL DEFAULT true,
          "frequency" "public"."notification_preferences_frequency_enum" NOT NULL DEFAULT 'IMMEDIATE',
          CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id")
        )
      `);
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'tenant_id'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'tenant_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'created_at'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'created_at',
          type: 'timestamptz',
          default: 'now()',
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'updated_at'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'updated_at',
          type: 'timestamptz',
          default: 'now()',
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'user_id'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'user_id',
          type: 'uuid',
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'notification_type'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'notification_type',
          type: 'enum',
          enumName: 'notification_preferences_notification_type_enum',
          enum: [
            'BOOKING_CREATED',
            'BOOKING_UPDATED',
            'BOOKING_CANCELLED',
            'TASK_ASSIGNED',
            'TASK_COMPLETED',
            'PAYMENT_RECEIVED',
            'SYSTEM_ALERT',
          ],
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'email_enabled'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'email_enabled',
          type: 'boolean',
          default: true,
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'in_app_enabled'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'in_app_enabled',
          type: 'boolean',
          default: true,
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('notification_preferences', 'frequency'))) {
      await queryRunner.addColumn(
        'notification_preferences',
        new TableColumn({
          name: 'frequency',
          type: 'enum',
          enumName: 'notification_preferences_frequency_enum',
          enum: ['IMMEDIATE', 'DAILY_DIGEST', 'NONE'],
          default: `'IMMEDIATE'`,
          isNullable: false,
        }),
      );
    }

    await queryRunner.query(`
      UPDATE "notification_preferences" np
      SET "tenant_id" = u."tenant_id"
      FROM "users" u
      WHERE np."user_id" = u."id"
        AND np."tenant_id" IS NULL
    `);

    const nullTenantRowsUnknown: unknown = await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM "notification_preferences"
      WHERE "tenant_id" IS NULL
    `);

    const nullTenantRows = Array.isArray(nullTenantRowsUnknown)
      ? (nullTenantRowsUnknown as Array<{ count?: number | string }>)
      : [];
    const unresolvedCount = Number(nullTenantRows[0]?.count ?? 0);

    if (unresolvedCount > 0) {
      throw new Error(
        `Cannot enforce NOT NULL on notification_preferences.tenant_id. ${unresolvedCount} row(s) could not be backfilled from users.`,
      );
    }

    await queryRunner.query(`ALTER TABLE "notification_preferences" ALTER COLUMN "tenant_id" SET NOT NULL`);

    const table = await queryRunner.getTable('notification_preferences');

    const hasUserForeignKey = table?.foreignKeys.some(
      (foreignKey) =>
        foreignKey.columnNames.length === 1 &&
        foreignKey.columnNames[0] === 'user_id' &&
        foreignKey.referencedTableName === 'users',
    );
    if (!hasUserForeignKey) {
      await queryRunner.createForeignKey(
        'notification_preferences',
        new TableForeignKey({
          name: 'FK_notification_preferences_user_id',
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const hasUserTypeUniqueIndex = table?.indices.some(
      (index) =>
        index.isUnique &&
        index.columnNames.length === 2 &&
        index.columnNames[0] === 'user_id' &&
        index.columnNames[1] === 'notification_type',
    );
    if (!hasUserTypeUniqueIndex) {
      await queryRunner.createIndex(
        'notification_preferences',
        new TableIndex({
          name: 'IDX_notification_preferences_user_type_unique',
          columnNames: ['user_id', 'notification_type'],
          isUnique: true,
        }),
      );
    }

    const hasTenantIndex = table?.indices.some(
      (index) => index.columnNames.length === 1 && index.columnNames[0] === 'tenant_id',
    );
    if (!hasTenantIndex) {
      await queryRunner.createIndex(
        'notification_preferences',
        new TableIndex({
          name: 'IDX_notification_preferences_tenant_id',
          columnNames: ['tenant_id'],
        }),
      );
    }
  }
}
