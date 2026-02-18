import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVendorsAndPurchaseInvoices1771300000000 implements MigrationInterface {
  name = 'CreateVendorsAndPurchaseInvoices1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vendors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "email" character varying,
        "phone" character varying,
        "notes" text,
        CONSTRAINT "PK_vendors" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_vendors_tenant_id_id" ON "vendors" ("tenant_id", "id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_vendors_tenant_id_name" ON "vendors" ("tenant_id", "name")
    `);

    await queryRunner.query(`
      CREATE TABLE "purchase_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "vendor_id" uuid NOT NULL,
        "invoice_number" character varying NOT NULL,
        "invoice_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "total_amount" numeric(12,2) NOT NULL DEFAULT '0',
        "notes" text,
        "transaction_id" uuid NOT NULL,
        CONSTRAINT "PK_purchase_invoices" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_purchase_invoices_tenant_id_id" ON "purchase_invoices" ("tenant_id", "id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_purchase_invoices_tenant_vendor_invoice" ON "purchase_invoices" ("tenant_id", "vendor_id", "invoice_number")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_invoices_tenant_invoice_date" ON "purchase_invoices" ("tenant_id", "invoice_date")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_purchase_invoices_tenant_transaction" ON "purchase_invoices" ("tenant_id", "transaction_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_invoices"
      ADD CONSTRAINT "FK_purchase_invoice_vendor_composite"
      FOREIGN KEY ("vendor_id", "tenant_id") REFERENCES "vendors"("id", "tenant_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_invoices"
      ADD CONSTRAINT "FK_purchase_invoice_transaction_composite"
      FOREIGN KEY ("transaction_id", "tenant_id") REFERENCES "transactions"("id", "tenant_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_invoices" DROP CONSTRAINT "FK_purchase_invoice_transaction_composite"`,
    );
    await queryRunner.query(`ALTER TABLE "purchase_invoices" DROP CONSTRAINT "FK_purchase_invoice_vendor_composite"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_purchase_invoices_tenant_transaction"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_purchase_invoices_tenant_invoice_date"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_purchase_invoices_tenant_vendor_invoice"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_purchase_invoices_tenant_id_id"`);
    await queryRunner.query(`DROP TABLE "purchase_invoices"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_vendors_tenant_id_name"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_vendors_tenant_id_id"`);
    await queryRunner.query(`DROP TABLE "vendors"`);
  }
}
