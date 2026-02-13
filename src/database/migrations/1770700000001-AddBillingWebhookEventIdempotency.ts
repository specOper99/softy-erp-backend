import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddBillingWebhookEventIdempotency1770700000001 implements MigrationInterface {
  name = 'AddBillingWebhookEventIdempotency1770700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('billing_webhook_events'))) {
      await queryRunner.createTable(
        new Table({
          name: 'billing_webhook_events',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'provider',
              type: 'varchar',
              length: '32',
            },
            {
              name: 'event_id',
              type: 'varchar',
              length: '255',
            },
            {
              name: 'created_at',
              type: 'timestamptz',
              default: 'now()',
            },
          ],
        }),
      );
    }

    const table = await queryRunner.getTable('billing_webhook_events');
    const hasIndex = table?.indices.some((idx) => idx.name === 'IDX_billing_webhook_events_provider_event');

    if (!hasIndex) {
      await queryRunner.createIndex(
        'billing_webhook_events',
        new TableIndex({
          name: 'IDX_billing_webhook_events_provider_event',
          columnNames: ['provider', 'event_id'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('billing_webhook_events')) {
      await queryRunner.dropIndex('billing_webhook_events', 'IDX_billing_webhook_events_provider_event');
      await queryRunner.dropTable('billing_webhook_events');
    }
  }
}
