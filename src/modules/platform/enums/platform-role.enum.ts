/**
 * Platform-level roles for superadmin console access
 * These roles are separate from tenant-level roles
 */
export enum PlatformRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // Full platform access
  SUPPORT_ADMIN = 'SUPPORT_ADMIN', // Customer support operations
  BILLING_ADMIN = 'BILLING_ADMIN', // Billing and subscription management
  COMPLIANCE_ADMIN = 'COMPLIANCE_ADMIN', // Data export, deletion, compliance
  SECURITY_ADMIN = 'SECURITY_ADMIN', // Security policy management
  ANALYTICS_VIEWER = 'ANALYTICS_VIEWER', // Read-only platform metrics
}
