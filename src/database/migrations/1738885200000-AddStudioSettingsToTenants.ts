import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudioSettingsToTenants1738885200000 implements MigrationInterface {
  name = 'AddStudioSettingsToTenants1738885200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add timezone column
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "timezone" VARCHAR(100) DEFAULT 'UTC'
    `);

    // Add working hours column (JSONB)
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "working_hours" JSONB
    `);

    // Add branding column (JSONB)
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "branding" JSONB
    `);

    // Add description column
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "description" TEXT
    `);

    // Add address column
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "address" VARCHAR(200)
    `);

    // Add phone column
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "phone" VARCHAR(20)
    `);

    // Add email column
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "email" VARCHAR(100)
    `);

    // Add website column
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN "website" VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "website"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "branding"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "working_hours"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "timezone"`);
  }
}
