/**
 * Injection tokens for tenant-aware repositories
 * These are defined in a separate file to avoid circular imports between modules and services.
 */

// Client Portal Module
export const TENANT_REPO_CLIENT = 'TENANT_REPO_CLIENT';

// Tasks Module
export const TENANT_REPO_TASK = 'TENANT_REPO_TASK';
export const TENANT_REPO_TIME_ENTRY = 'TENANT_REPO_TIME_ENTRY';

// Finance Module
export const TENANT_REPO_PURCHASE_INVOICE = 'TENANT_REPO_PURCHASE_INVOICE';
export const TENANT_REPO_PAYOUT = 'TENANT_REPO_PAYOUT';
export const TENANT_REPO_VENDOR = 'TENANT_REPO_VENDOR';
export const TENANT_REPO_TRANSACTION_CATEGORY = 'TENANT_REPO_TRANSACTION_CATEGORY';

// HR Module
export const TENANT_REPO_ATTENDANCE = 'TENANT_REPO_ATTENDANCE';
export const TENANT_REPO_STAFF_AVAILABILITY = 'TENANT_REPO_STAFF_AVAILABILITY';
