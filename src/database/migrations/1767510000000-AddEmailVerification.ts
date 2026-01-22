import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerification1767510000000 implements MigrationInterface {
  name = 'AddEmailVerification1767510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add email_verified to users
    await queryRunner.query(`ALTER TABLE "users" ADD "email_verified" boolean NOT NULL DEFAULT false`);

    // Create email_verification_tokens table
    await queryRunner.query(`
            CREATE TABLE "email_verification_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "token_hash" character varying NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "used" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX "IDX_email_verification_tokens_email" ON "email_verification_tokens" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_verification_tokens_token_hash" ON "email_verification_tokens" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_email_verification_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX "IDX_email_verification_tokens_email"`);
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified"`);
  }
}
