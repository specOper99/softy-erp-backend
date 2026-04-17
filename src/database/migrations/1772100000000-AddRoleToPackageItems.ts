import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleToPackageItems1772100000000 implements MigrationInterface {
  name = 'AddRoleToPackageItems1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_items" ADD COLUMN IF NOT EXISTS "role" VARCHAR(50) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "package_items" DROP COLUMN IF EXISTS "role"`);
  }
}
