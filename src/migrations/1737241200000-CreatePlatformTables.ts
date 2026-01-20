import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreatePlatformTables1737241200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create platform_users table
    await queryRunner.createTable(
      new Table({
        name: 'platform_users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'full_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'role',
            type: 'varchar',
            length: '50',
            default: "'ANALYTICS_VIEWER'",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'active'",
          },
          {
            name: 'mfa_enabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'mfa_secret',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'mfa_recovery_codes',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'last_login_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_login_ip',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'ip_allowlist',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'trusted_devices',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'failed_login_attempts',
            type: 'int',
            default: 0,
          },
          {
            name: 'locked_until',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'must_change_password',
            type: 'boolean',
            default: false,
          },
          {
            name: 'password_changed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'platform_users',
      new TableIndex({
        name: 'IDX_platform_users_email',
        columnNames: ['email'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      }),
    );

    await queryRunner.createIndex(
      'platform_users',
      new TableIndex({
        name: 'IDX_platform_users_status_created',
        columnNames: ['status', 'created_at'],
      }),
    );

    // Create platform_sessions table
    await queryRunner.createTable(
      new Table({
        name: 'platform_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'session_token',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'refresh_token',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
          },
          {
            name: 'user_agent',
            type: 'text',
          },
          {
            name: 'device_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'device_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'mfa_verified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'mfa_verified_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'expires_at',
            type: 'timestamp',
          },
          {
            name: 'last_activity_at',
            type: 'timestamp',
          },
          {
            name: 'is_revoked',
            type: 'boolean',
            default: false,
          },
          {
            name: 'revoked_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'revoked_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'revoked_reason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'platform_sessions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'platform_users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'platform_sessions',
      new TableIndex({
        name: 'IDX_platform_sessions_user_expires',
        columnNames: ['user_id', 'expires_at'],
      }),
    );

    await queryRunner.createIndex(
      'platform_sessions',
      new TableIndex({
        name: 'IDX_platform_sessions_revoked_expires',
        columnNames: ['is_revoked', 'expires_at'],
      }),
    );

    // Create platform_audit_logs table
    await queryRunner.createTable(
      new Table({
        name: 'platform_audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'platform_user_id',
            type: 'uuid',
          },
          {
            name: 'action',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'target_tenant_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'target_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'target_entity_type',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'target_entity_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'request_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'changes_before',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'changes_after',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'success',
            type: 'boolean',
            default: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'performed_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'additional_context',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'platform_audit_logs',
      new TableForeignKey({
        columnNames: ['platform_user_id'],
        referencedTableName: 'platform_users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'platform_audit_logs',
      new TableIndex({
        name: 'IDX_platform_audit_user_performed',
        columnNames: ['platform_user_id', 'performed_at'],
      }),
    );

    await queryRunner.createIndex(
      'platform_audit_logs',
      new TableIndex({
        name: 'IDX_platform_audit_action_performed',
        columnNames: ['action', 'performed_at'],
      }),
    );

    await queryRunner.createIndex(
      'platform_audit_logs',
      new TableIndex({
        name: 'IDX_platform_audit_tenant_performed',
        columnNames: ['target_tenant_id', 'performed_at'],
      }),
    );

    await queryRunner.createIndex(
      'platform_audit_logs',
      new TableIndex({
        name: 'IDX_platform_audit_performed',
        columnNames: ['performed_at'],
      }),
    );

    // Create impersonation_sessions table
    await queryRunner.createTable(
      new Table({
        name: 'impersonation_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'platform_user_id',
            type: 'uuid',
          },
          {
            name: 'tenant_id',
            type: 'uuid',
          },
          {
            name: 'target_user_id',
            type: 'uuid',
          },
          {
            name: 'target_user_email',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'reason',
            type: 'text',
          },
          {
            name: 'approval_ticket_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'session_token',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'started_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'ended_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
          },
          {
            name: 'user_agent',
            type: 'text',
          },
          {
            name: 'actions_performed',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'ended_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'end_reason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'impersonation_sessions',
      new TableForeignKey({
        columnNames: ['platform_user_id'],
        referencedTableName: 'platform_users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'impersonation_sessions',
      new TableIndex({
        name: 'IDX_impersonation_platform_user_started',
        columnNames: ['platform_user_id', 'started_at'],
      }),
    );

    await queryRunner.createIndex(
      'impersonation_sessions',
      new TableIndex({
        name: 'IDX_impersonation_tenant_target',
        columnNames: ['tenant_id', 'target_user_id'],
      }),
    );

    await queryRunner.createIndex(
      'impersonation_sessions',
      new TableIndex({
        name: 'IDX_impersonation_started_ended',
        columnNames: ['started_at', 'ended_at'],
      }),
    );

    // Create tenant_lifecycle_events table
    await queryRunner.createTable(
      new Table({
        name: 'tenant_lifecycle_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tenant_id',
            type: 'uuid',
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'triggered_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'triggered_by_type',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'previous_state',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'new_state',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'occurred_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'tenant_lifecycle_events',
      new TableIndex({
        name: 'IDX_lifecycle_tenant_type_occurred',
        columnNames: ['tenant_id', 'event_type', 'occurred_at'],
      }),
    );

    // Add new columns to tenants table
    await queryRunner.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50),
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS suspended_by UUID,
      ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
      ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS total_users INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_bookings INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mrr DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS risk_score DECIMAL(3, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS health_score DECIMAL(3, 2) DEFAULT 1,
      ADD COLUMN IF NOT EXISTS compliance_flags JSON DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS security_policies JSONB,
      ADD COLUMN IF NOT EXISTS custom_rate_limits JSONB,
      ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS metadata JSONB
    `);

    // Create indexes for tenant platform fields
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tenants_status_created ON tenants(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tenants_subscription ON tenants(subscription_plan, status);
      CREATE INDEX IF NOT EXISTS idx_tenants_risk ON tenants(risk_score DESC) WHERE risk_score > 0.5;
      CREATE INDEX IF NOT EXISTS idx_tenants_activity ON tenants(last_activity_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_activity`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_risk`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_subscription`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_status_created`);

    // Remove columns from tenants
    await queryRunner.query(`
      ALTER TABLE tenants 
      DROP COLUMN IF EXISTS subscription_tier,
      DROP COLUMN IF EXISTS stripe_customer_id,
      DROP COLUMN IF EXISTS stripe_subscription_id,
      DROP COLUMN IF EXISTS billing_email,
      DROP COLUMN IF EXISTS subscription_started_at,
      DROP COLUMN IF EXISTS subscription_ends_at,
      DROP COLUMN IF EXISTS trial_ends_at,
      DROP COLUMN IF EXISTS suspended_at,
      DROP COLUMN IF EXISTS suspended_by,
      DROP COLUMN IF EXISTS suspension_reason,
      DROP COLUMN IF EXISTS grace_period_ends_at,
      DROP COLUMN IF EXISTS deletion_scheduled_at,
      DROP COLUMN IF EXISTS last_activity_at,
      DROP COLUMN IF EXISTS total_users,
      DROP COLUMN IF EXISTS total_bookings,
      DROP COLUMN IF EXISTS total_revenue,
      DROP COLUMN IF EXISTS mrr,
      DROP COLUMN IF EXISTS risk_score,
      DROP COLUMN IF EXISTS health_score,
      DROP COLUMN IF EXISTS compliance_flags,
      DROP COLUMN IF EXISTS security_policies,
      DROP COLUMN IF EXISTS custom_rate_limits,
      DROP COLUMN IF EXISTS feature_flags,
      DROP COLUMN IF EXISTS metadata
    `);

    // Drop tables in reverse order
    await queryRunner.dropTable('tenant_lifecycle_events');
    await queryRunner.dropTable('impersonation_sessions');
    await queryRunner.dropTable('platform_audit_logs');
    await queryRunner.dropTable('platform_sessions');
    await queryRunner.dropTable('platform_users');
  }
}
