import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkipStaffCheckToServicePackages1718064000000 implements MigrationInterface {
  name = 'AddSkipStaffCheckToServicePackages1718064000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_packages" ADD COLUMN "skip_staff_check" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "service_packages" DROP COLUMN "skip_staff_check"`);
  }
}
