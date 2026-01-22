import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoicesTable1735940000000 implements MigrationInterface {
  name = 'CreateInvoicesTable1735940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."invoices_status_enum" AS ENUM('DRAFT', 'SENT', 'PAID', 'VOID')
    `);

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "invoice_number" character varying NOT NULL,
        "booking_id" uuid NOT NULL,
        "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'DRAFT',
        "issue_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "due_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "items" jsonb NOT NULL DEFAULT '[]',
        "sub_total" numeric(12,2) NOT NULL DEFAULT '0',
        "tax_total" numeric(12,2) NOT NULL DEFAULT '0',
        "total_amount" numeric(12,2) NOT NULL DEFAULT '0',
        "currency" character varying,
        "notes" text,
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_invoices_tenant_number" ON "invoices" ("tenant_id", "invoice_number")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_tenant_id" ON "invoices" ("tenant_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices" 
      ADD CONSTRAINT "FK_invoices_booking_id" 
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_booking_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invoices_tenant_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invoices_tenant_number"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
  }
}
