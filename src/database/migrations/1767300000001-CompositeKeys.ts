import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompositeKeys1767300000001 implements MigrationInterface {
  name = 'CompositeKeys1767300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create Unique Index on Users (id, tenant_id) - idempotent
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_composite_tenant" ON "users" ("id", "tenant_id")`,
    );

    // 2. Add the composite FK for tasks -> users (idempotent)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_task_user_composite') THEN
          ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_user_composite" FOREIGN KEY ("assigned_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_task_user_composite"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_composite_tenant"`);
  }
}
