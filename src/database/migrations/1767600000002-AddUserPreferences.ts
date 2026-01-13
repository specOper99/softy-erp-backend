import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPreferences1735936000000 implements MigrationInterface {
  name = 'AddUserPreferences1735936000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "dashboardConfig" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "REL_user_preferences_user_id" UNIQUE ("user_id"),
        CONSTRAINT "PK_user_preferences" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "user_preferences" 
      ADD CONSTRAINT "FK_user_preferences_user_id" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP CONSTRAINT "FK_user_preferences_user_id"`);
    await queryRunner.query(`DROP TABLE "user_preferences"`);
  }
}
