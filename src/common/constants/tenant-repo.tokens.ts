/**
 * Injection tokens for tenant-aware repositories
 * These are defined in a separate file to avoid circular imports between modules and services.
 */

// Client Portal Module
export const TENANT_REPO_CLIENT = 'TENANT_REPO_CLIENT';

// HR Module
export const TENANT_REPO_ATTENDANCE = 'TENANT_REPO_ATTENDANCE';
