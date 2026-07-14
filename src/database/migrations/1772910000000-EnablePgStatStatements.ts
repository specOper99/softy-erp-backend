import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Enable pg_stat_statements for measured query profiling (operator may need shared_preload_libraries). */
export class EnablePgStatStatements1772910000000 implements MigrationInterface {
  name = 'EnablePgStatStatements1772910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_stat_statements`);
  }
}
