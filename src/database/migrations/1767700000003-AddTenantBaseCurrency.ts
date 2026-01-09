import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTenantBaseCurrency1767700000003 implements MigrationInterface {
  name = 'AddTenantBaseCurrency1767700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create currency enum if it doesn't exist (safe check handled by try/catch or just create if distinct)
    // Or cleaner: check if type exists.
    // For simplicity and standard TypeORM migration patterns: use query to create type if not exists.
    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "currency_enum" AS ENUM ('USD', 'EUR', 'GBP', 'AED', 'SAR');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.addColumn(
      'tenants',
      new TableColumn({
        name: 'base_currency',
        type: 'enum',
        enumName: 'currency_enum',
        enum: ['USD', 'EUR', 'GBP', 'AED', 'SAR'],
        default: "'USD'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tenants', 'base_currency');
    await queryRunner.query(`DROP TYPE "currency_enum"`);
  }
}
