import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMfaFields1767439784793 implements MigrationInterface {
  name = 'AddMfaFields1767439784793';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "mfa_secret" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_mfa_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "mfa_recovery_codes" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mfa_recovery_codes"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_mfa_enabled"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_secret"`);
  }
}
