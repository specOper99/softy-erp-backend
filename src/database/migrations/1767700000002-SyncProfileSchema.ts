import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncProfileSchema1767700000002 implements MigrationInterface {
  name = 'SyncProfileSchema1767700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "emergency_contact_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "emergency_contact_phone" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "address" character varying`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "city" character varying`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "country" character varying`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "department" character varying`);
    await queryRunner.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "team" character varying`);

    await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "profiles_contract_type_enum" AS ENUM ('FULL_TIME', 'PART_TIME', 'FREELANCE', 'INTERN', 'CONTRACTOR');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "contract_type" "profiles_contract_type_enum" DEFAULT 'FULL_TIME'`,
    );

    // Add columns to payouts and transactions
    await queryRunner.query(
      `ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "currency" character varying DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "commission_amount" numeric(12,2) DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "metadata" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "currency" character varying DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(12,6) DEFAULT 1.0`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "department" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "department"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "exchange_rate"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "currency"`);
    await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN IF EXISTS "metadata"`);
    await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN IF EXISTS "commission_amount"`);
    await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN IF EXISTS "currency"`);

    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "contract_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "profiles_contract_type_enum"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "team"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "department"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "country"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "city"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "address"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "emergency_contact_phone"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "emergency_contact_name"`);
  }
}
