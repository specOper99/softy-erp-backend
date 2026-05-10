import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStaffAvailabilitySlots20260504100000 implements MigrationInterface {
  name = 'CreateStaffAvailabilitySlots20260504100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff_availability_slots" (
        "id"             uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id"      uuid              NOT NULL,
        "user_id"        uuid              NOT NULL,
        "day_of_week"    smallint          NOT NULL,
        "start_time"     character varying(5)  NOT NULL,
        "end_time"       character varying(5)  NOT NULL,
        "is_recurring"   boolean           NOT NULL DEFAULT true,
        "effective_from" date              NOT NULL,
        "effective_to"   date,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_availability_slots" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_staff_availability_tenant_user_day"
        ON "staff_availability_slots" ("tenant_id", "user_id", "day_of_week")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_staff_availability_tenant_user"
        ON "staff_availability_slots" ("tenant_id", "user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_staff_availability_tenant_id"
        ON "staff_availability_slots" ("tenant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_staff_availability_tenant_id"`);
    await queryRunner.query(`DROP INDEX "IDX_staff_availability_tenant_user"`);
    await queryRunner.query(`DROP INDEX "IDX_staff_availability_tenant_user_day"`);
    await queryRunner.query(`DROP TABLE "staff_availability_slots"`);
  }
}
