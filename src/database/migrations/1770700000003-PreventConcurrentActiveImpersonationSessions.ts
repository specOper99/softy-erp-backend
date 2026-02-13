import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreventConcurrentActiveImpersonationSessions1770700000003 implements MigrationInterface {
  name = 'PreventConcurrentActiveImpersonationSessions1770700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('impersonation_sessions')) {
      await queryRunner.query(`
        WITH ranked_active AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY platform_user_id, tenant_id, target_user_id
                   ORDER BY started_at DESC, id DESC
                 ) AS rn
          FROM impersonation_sessions
          WHERE is_active = true
        )
        UPDATE impersonation_sessions s
        SET is_active = false,
            ended_at = COALESCE(s.ended_at, now()),
            end_reason = COALESCE(s.end_reason, 'Auto-ended during uniqueness hardening migration')
        FROM ranked_active ra
        WHERE s.id = ra.id
          AND ra.rn > 1
      `);

      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_impersonation_active_unique"
        ON "impersonation_sessions" ("platform_user_id", "tenant_id", "target_user_id")
        WHERE "is_active" = true
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('impersonation_sessions')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_impersonation_active_unique"`);
    }
  }
}
