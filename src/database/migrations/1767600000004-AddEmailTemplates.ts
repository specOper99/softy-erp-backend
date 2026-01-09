import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailTemplates1735990000000 implements MigrationInterface {
  name = 'AddEmailTemplates1735990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "email_templates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "tenant_id" uuid NOT NULL,
                "name" character varying NOT NULL,
                "subject" character varying NOT NULL,
                "content" text NOT NULL,
                "variables" jsonb NOT NULL DEFAULT '[]',
                "is_system" boolean NOT NULL DEFAULT false,
                "description" character varying,
                CONSTRAINT "PK_email_templates" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_email_templates_tenant_name" ON "email_templates" ("tenant_id", "name")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_templates_tenant_name"`,
    );
    await queryRunner.query(`DROP TABLE "email_templates"`);
  }
}
