import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetTokens1770000000000 implements MigrationInterface {
  name = 'AddPasswordResetTokens1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_password_reset_tokens_email" ON "password_reset_tokens" ("email")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_token_hash" ON "password_reset_tokens" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_email"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
