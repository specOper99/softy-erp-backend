import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Tenant } from '../../tenants/domain/entities/tenant.entity';

/**
 * Ordered tenant-scoped table purge (children before parents).
 * platform_audit_logs and tenant_lifecycle_events are retained for compliance.
 */
const TENANT_PURGE_TABLES: readonly string[] = [
  'time_entries',
  'task_assignees',
  'webhook_deliveries',
  'notifications',
  'notification_preferences',
  'reviews',
  'processing_type_eligibilities',
  'tasks',
  'attendance',
  'performance_reviews',
  'staff_availability_slots',
  'transactions',
  'payouts',
  'recurring_transactions',
  'invoices',
  'purchase_invoices',
  'employee_wallets',
  'department_budgets',
  'payroll_runs',
  'bookings',
  'clients',
  'processing_types',
  'service_packages',
  'task_templates',
  'transaction_categories',
  'vendors',
  'webhooks',
  'email_templates',
  'daily_metrics',
  'privacy_requests',
  'outbox_events',
  'audit_logs',
  'subscriptions',
  'impersonation_sessions',
];

@Injectable()
export class TenantPurgeService {
  private readonly logger = new Logger(TenantPurgeService.name);

  async purgeTenantData(tenantId: string, manager: EntityManager): Promise<void> {
    for (const table of TENANT_PURGE_TABLES) {
      const result: unknown = await manager.query(`DELETE FROM "${table}" WHERE tenant_id = $1`, [tenantId]);
      const rowCount =
        typeof result === 'object' && result !== null && 'rowCount' in result
          ? Number((result as { rowCount: number }).rowCount)
          : 0;
      if (rowCount > 0) {
        this.logger.log(`Purged ${rowCount} row(s) from ${table} for tenant ${tenantId}`);
      }
    }

    await manager.query(`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)`, [
      tenantId,
    ]);
    await manager.query(
      `DELETE FROM password_reset_tokens WHERE email IN (SELECT email FROM users WHERE tenant_id = $1)`,
      [tenantId],
    );
    await manager.query(
      `DELETE FROM email_verification_tokens WHERE email IN (SELECT email FROM users WHERE tenant_id = $1)`,
      [tenantId],
    );
    await manager.query(`DELETE FROM user_preferences WHERE tenant_id = $1`, [tenantId]);
    await manager.query(`DELETE FROM profiles WHERE tenant_id = $1`, [tenantId]);
    await manager.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);

    const tenantDelete = await manager.delete(Tenant, { id: tenantId });
    this.logger.warn(`Tenant row removed: ${tenantId} (affected=${tenantDelete.affected ?? 0})`);
  }
}
