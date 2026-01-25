import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutboxEvents1770100000000 implements MigrationInterface {
  name = 'CreateOutboxEvents1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."outbox_events_status_enum" AS ENUM('PENDING', 'PUBLISHED', 'FAILED')
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "aggregateId" character varying NOT NULL,
        "type" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" "public"."outbox_events_status_enum" NOT NULL DEFAULT 'PENDING',
        "error" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TYPE "public"."outbox_events_status_enum"`);
  }
}
