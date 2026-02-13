import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class HardenPlatformSessionsAndSyncInvoiceSchema1770700000000 implements MigrationInterface {
  name = 'HardenPlatformSessionsAndSyncInvoiceSchema1770700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('platform_sessions')) {
      if (!(await queryRunner.hasColumn('platform_sessions', 'session_token_hash'))) {
        await queryRunner.addColumn(
          'platform_sessions',
          new TableColumn({
            name: 'session_token_hash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          }),
        );
      }

      if (!(await queryRunner.hasColumn('platform_sessions', 'refresh_token_hash'))) {
        await queryRunner.addColumn(
          'platform_sessions',
          new TableColumn({
            name: 'refresh_token_hash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          }),
        );
      }

      const hasSessionHashIndex = (await queryRunner.getTable('platform_sessions'))?.indices.some(
        (idx) => idx.name === 'IDX_platform_sessions_session_token_hash_unique',
      );
      if (!hasSessionHashIndex) {
        await queryRunner.createIndex(
          'platform_sessions',
          new TableIndex({
            name: 'IDX_platform_sessions_session_token_hash_unique',
            columnNames: ['session_token_hash'],
            isUnique: true,
            where: 'session_token_hash IS NOT NULL',
          }),
        );
      }
    }

    if (await queryRunner.hasTable('invoices')) {
      await queryRunner.query(`
        DO $$
        BEGIN
          ALTER TYPE "public"."invoices_status_enum" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
          ALTER TYPE "public"."invoices_status_enum" ADD VALUE IF NOT EXISTS 'OVERDUE';
          ALTER TYPE "public"."invoices_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED';
        END $$;
      `);

      if (!(await queryRunner.hasColumn('invoices', 'client_id'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'client_id',
            type: 'uuid',
            isNullable: true,
          }),
        );
      }

      if (!(await queryRunner.hasColumn('invoices', 'tax_rate'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'tax_rate',
            type: 'numeric',
            precision: 5,
            scale: 2,
            default: '0',
          }),
        );
      }

      if (!(await queryRunner.hasColumn('invoices', 'amount_paid'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'amount_paid',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0',
          }),
        );
      }

      if (!(await queryRunner.hasColumn('invoices', 'balance_due'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'balance_due',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: '0',
          }),
        );
      }

      if (!(await queryRunner.hasColumn('invoices', 'paid_date'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'paid_date',
            type: 'timestamptz',
            isNullable: true,
          }),
        );
      }

      if (!(await queryRunner.hasColumn('invoices', 'sent_at'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'sent_at',
            type: 'timestamptz',
            isNullable: true,
          }),
        );
      }

      if (!(await queryRunner.hasColumn('invoices', 'pdf_url'))) {
        await queryRunner.addColumn(
          'invoices',
          new TableColumn({
            name: 'pdf_url',
            type: 'varchar',
            isNullable: true,
          }),
        );
      }

      await queryRunner.query(`
        UPDATE "invoices" i
        SET "client_id" = b."client_id"
        FROM "bookings" b
        WHERE i."booking_id" = b."id"
          AND i."client_id" IS NULL
      `);

      await queryRunner.query(`
        UPDATE "invoices"
        SET "balance_due" = GREATEST(0, "total_amount" - COALESCE("amount_paid", 0))
        WHERE "balance_due" IS NULL OR "balance_due" = 0
      `);

      const hasClientIndex = (await queryRunner.getTable('invoices'))?.indices.some(
        (idx) => idx.name === 'IDX_invoices_tenant_client',
      );
      if (!hasClientIndex) {
        await queryRunner.createIndex(
          'invoices',
          new TableIndex({
            name: 'IDX_invoices_tenant_client',
            columnNames: ['tenant_id', 'client_id'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('invoices')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_tenant_client"`);

      if (await queryRunner.hasColumn('invoices', 'pdf_url')) {
        await queryRunner.dropColumn('invoices', 'pdf_url');
      }
      if (await queryRunner.hasColumn('invoices', 'sent_at')) {
        await queryRunner.dropColumn('invoices', 'sent_at');
      }
      if (await queryRunner.hasColumn('invoices', 'paid_date')) {
        await queryRunner.dropColumn('invoices', 'paid_date');
      }
      if (await queryRunner.hasColumn('invoices', 'balance_due')) {
        await queryRunner.dropColumn('invoices', 'balance_due');
      }
      if (await queryRunner.hasColumn('invoices', 'amount_paid')) {
        await queryRunner.dropColumn('invoices', 'amount_paid');
      }
      if (await queryRunner.hasColumn('invoices', 'tax_rate')) {
        await queryRunner.dropColumn('invoices', 'tax_rate');
      }
      if (await queryRunner.hasColumn('invoices', 'client_id')) {
        await queryRunner.dropColumn('invoices', 'client_id');
      }
    }

    if (await queryRunner.hasTable('platform_sessions')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_sessions_session_token_hash_unique"`);

      if (await queryRunner.hasColumn('platform_sessions', 'refresh_token_hash')) {
        await queryRunner.dropColumn('platform_sessions', 'refresh_token_hash');
      }
      if (await queryRunner.hasColumn('platform_sessions', 'session_token_hash')) {
        await queryRunner.dropColumn('platform_sessions', 'session_token_hash');
      }
    }
  }
}
