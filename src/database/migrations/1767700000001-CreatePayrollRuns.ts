import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayrollRuns1767700000001 implements MigrationInterface {
  name = 'CreatePayrollRuns1767700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "payroll_runs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "total_employees" integer NOT NULL,
                "total_payout" numeric(12,2) NOT NULL,
                "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "status" character varying NOT NULL DEFAULT 'COMPLETED',
                "transaction_ids" jsonb,
                "notes" text,
                CONSTRAINT "PK_payroll_runs_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_payroll_runs_tenant_id_id" ON "payroll_runs" ("tenant_id", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payroll_runs_tenant_id_id"`);
    await queryRunner.query(`DROP TABLE "payroll_runs"`);
  }
}
