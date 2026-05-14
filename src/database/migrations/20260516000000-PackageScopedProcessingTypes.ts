import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PackageScopedProcessingTypes20260516000000 implements MigrationInterface {
  name = 'PackageScopedProcessingTypes20260516000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "processing_types" ADD COLUMN "package_id" uuid`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM processing_types pt
          WHERE NOT EXISTS (
            SELECT 1
            FROM service_packages sp
            WHERE sp.tenant_id = pt.tenant_id
          )
        ) THEN
          RAISE EXCEPTION 'Cannot scope processing_types to packages: at least one tenant has processing types but no service packages';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE processing_types pt
      SET package_id = first_package.id
      FROM (
        SELECT DISTINCT ON (tenant_id) id, tenant_id
        FROM service_packages
        ORDER BY tenant_id, created_at ASC, id ASC
      ) first_package
      WHERE first_package.tenant_id = pt.tenant_id
        AND pt.package_id IS NULL
    `);

    await queryRunner.query(`ALTER TABLE "processing_types" ALTER COLUMN "package_id" SET NOT NULL`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_processing_types_tenant_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_processing_types_tenant_package_name" ON "processing_types" ("tenant_id", "package_id", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_processing_types_tenant_package_active_sort" ON "processing_types" ("tenant_id", "package_id", "is_active", "sort_order")`,
    );
    await queryRunner.query(`
      ALTER TABLE "processing_types"
      ADD CONSTRAINT "FK_processing_types_package"
      FOREIGN KEY ("package_id")
      REFERENCES "service_packages"("id")
      ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "processing_types" DROP CONSTRAINT IF EXISTS "FK_processing_types_package"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_processing_types_tenant_package_active_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_processing_types_tenant_package_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_processing_types_tenant_name" ON "processing_types" ("tenant_id", "name")`,
    );
    await queryRunner.query(`ALTER TABLE "processing_types" DROP COLUMN "package_id"`);
  }
}
