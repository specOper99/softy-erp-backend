import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTaskTypeAddProcessingTypeEligibility20260515000000 implements MigrationInterface {
  name = 'RemoveTaskTypeAddProcessingTypeEligibility20260515000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add price and default_commission_amount to processing_types
    await queryRunner.query(`
      ALTER TABLE "processing_types"
        ADD COLUMN IF NOT EXISTS "price" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "default_commission_amount" numeric(12,2) NOT NULL DEFAULT 0
    `);

    // 2. Create processing_type_eligibilities table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processing_type_eligibilities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "processing_type_id" uuid NOT NULL,
        CONSTRAINT "PK_processing_type_eligibilities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pte_tenant_user_pt" UNIQUE ("tenant_id", "user_id", "processing_type_id"),
        CONSTRAINT "FK_pte_processing_type" FOREIGN KEY ("processing_type_id")
          REFERENCES "processing_types"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pte_tenant_id" ON "processing_type_eligibilities" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pte_user_id" ON "processing_type_eligibilities" ("user_id")
    `);

    // 3. Add processing_type_id to tasks (nullable)
    await queryRunner.query(`
      ALTER TABLE "tasks"
        ADD COLUMN IF NOT EXISTS "processing_type_id" uuid,
        ADD CONSTRAINT "FK_tasks_processing_type" FOREIGN KEY ("processing_type_id")
          REFERENCES "processing_types"("id") ON DELETE SET NULL
    `);

    // 4. Drop task_type_id from tasks
    await queryRunner.query(`
      ALTER TABLE "tasks"
        DROP CONSTRAINT IF EXISTS "FK_tasks_task_type",
        DROP COLUMN IF EXISTS "task_type_id"
    `);

    // 5. Drop task_type_eligibilities table
    await queryRunner.query(`DROP TABLE IF EXISTS "task_type_eligibilities" CASCADE`);

    // 6. Drop package_items table
    await queryRunner.query(`DROP TABLE IF EXISTS "package_items" CASCADE`);

    // 7. Drop task_types table
    await queryRunner.query(`DROP TABLE IF EXISTS "task_types" CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate task_types
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "task_types" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar NOT NULL,
        "description" text,
        "default_commission_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_task_types" PRIMARY KEY ("id")
      )
    `);

    // Recreate package_items
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "package_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "package_id" uuid NOT NULL,
        "task_type_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_package_items" PRIMARY KEY ("id")
      )
    `);

    // Recreate task_type_eligibilities
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "task_type_eligibilities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "task_type_id" uuid NOT NULL,
        CONSTRAINT "PK_task_type_eligibilities" PRIMARY KEY ("id")
      )
    `);

    // Restore task_type_id on tasks
    await queryRunner.query(`
      ALTER TABLE "tasks"
        ADD COLUMN IF NOT EXISTS "task_type_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
    `);

    // Drop processing_type_id from tasks
    await queryRunner.query(`
      ALTER TABLE "tasks"
        DROP CONSTRAINT IF EXISTS "FK_tasks_processing_type",
        DROP COLUMN IF EXISTS "processing_type_id"
    `);

    // Drop processing_type_eligibilities
    await queryRunner.query(`DROP TABLE IF EXISTS "processing_type_eligibilities" CASCADE`);

    // Remove price and default_commission_amount from processing_types
    await queryRunner.query(`
      ALTER TABLE "processing_types"
        DROP COLUMN IF EXISTS "price",
        DROP COLUMN IF EXISTS "default_commission_amount"
    `);
  }
}
