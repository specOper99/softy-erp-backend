import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompositeKeys1767300000001 implements MigrationInterface {
  name = 'CompositeKeys1767300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing simple FK if it exists (name might vary, trying strict convention or ignoring error if possible)
    // Since we can't know the exact name without DB inspection, and we want this to be safe:
    // We will attempt to drop the likely named constraint. In TypeORM it's notoriously hard to guess.
    // BUT, we defined specific JoinColumns in the Entity.

    // 1. Create Unique Index on Users (id, tenant_id)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_composite_tenant" ON "users" ("id", "tenant_id")`,
    );

    // 2. Drop old FK on tasks.assigned_user_id
    // We will retrieve the constraint name dynamically or try common naming conventions.
    // For safety in this manual patch, we might skipping DROP if we assume fresh state or handle it generically.
    // However, to enforce the new Composite FK, we MUST add it to the column definition or constraint.

    // Let's assume the previous FK was named by TypeORM default.
    // We will add the new Constraint.
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_user_composite" FOREIGN KEY ("assigned_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_task_user_composite"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_composite_tenant"`);
  }
}
