import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientTags1767600000001 implements MigrationInterface {
  name = 'AddClientTags1767600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add tags column as JSONB with default empty array
    await queryRunner.query(`
      ALTER TABLE "clients" 
      ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb
    `);

    // Create GIN index for efficient tag queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_clients_tags" 
      ON "clients" USING GIN ("tags")
    `);

    // Add comment for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN "clients"."tags" 
      IS 'Array of tag strings for client categorization'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the GIN index
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clients_tags"`);

    // Drop the tags column
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN IF EXISTS "tags"`,
    );
  }
}
