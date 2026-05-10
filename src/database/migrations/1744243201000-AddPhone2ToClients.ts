import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhone2ToClients1744243201000 implements MigrationInterface {
  name = 'AddPhone2ToClients1744243201000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "phone2" VARCHAR NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN IF EXISTS "phone2"`);
  }
}
