/**
 * Fine-grained platform permissions for RBAC
 */
export enum PlatformPermission {
  // Tenant management
  TENANTS_READ = 'platform:tenants:read',
  TENANTS_CREATE = 'platform:tenants:create',
  TENANTS_UPDATE = 'platform:tenants:update',
  TENANTS_DELETE = 'platform:tenants:delete',
  TENANTS_SUSPEND = 'platform:tenants:suspend',
  TENANTS_LOCK = 'platform:tenants:lock',

  // Billing operations
  BILLING_READ = 'platform:billing:read',
  BILLING_MANAGE = 'platform:billing:manage',
  BILLING_REFUND = 'platform:billing:refund',
  BILLING_EXPORT = 'platform:billing:export',

  // Support operations
  SUPPORT_IMPERSONATE = 'platform:support:impersonate',
  SUPPORT_VIEW_LOGS = 'platform:support:view_logs',
  SUPPORT_VIEW_ERRORS = 'platform:support:view_errors',

  // Security operations
  SECURITY_POLICIES_MANAGE = 'platform:security:policies_manage',
  SECURITY_FORCE_PASSWORD_RESET = 'platform:security:force_password_reset',
  SECURITY_REVOKE_SESSIONS = 'platform:security:revoke_sessions',
  SECURITY_UPDATE_IP_ALLOWLIST = 'platform:security:update_ip_allowlist',
  SECURITY_VIEW_RISK_SCORES = 'platform:security:view_risk_scores',

  // Compliance operations
  DATA_EXPORT = 'platform:data:export',
  DATA_DELETE = 'platform:data:delete',

  // Analytics
  ANALYTICS_VIEW = 'platform:analytics:view',
  ANALYTICS_VIEW_PLATFORM_METRICS = 'platform:analytics:view_platform_metrics',
  ANALYTICS_VIEW_TENANT_HEALTH = 'platform:analytics:view_tenant_health',
  ANALYTICS_VIEW_REVENUE_REPORTS = 'platform:analytics:view_revenue_reports',
  AUDIT_LOGS_READ = 'platform:audit:read',
  AUDIT_LOGS_EXPORT = 'platform:audit:export',

  // Operations
  OPERATIONS_MANAGE = 'platform:operations:manage',
  FEATURE_FLAGS_MANAGE = 'platform:feature_flags:manage',
}
