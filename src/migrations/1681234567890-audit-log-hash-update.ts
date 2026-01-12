import { MigrationInterface, QueryRunner } from 'typeorm';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';

export class AuditLogHashUpdate1681234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use queryRunner's manager to ensure we use the active connection
    const repo = queryRunner.manager.getRepository(AuditLog);
    const logs = await repo.find();
    for (const log of logs) {
      const newHash = log.calculateHash();
      await repo.update(log.id, { hash: newHash });
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No rollback needed for hash recalculation
  }
}
