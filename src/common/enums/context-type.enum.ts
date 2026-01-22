/**
 * Context type for dual-context authorization architecture
 */
export enum ContextType {
  TENANT = 'tenant', // Regular tenant-scoped operations
  PLATFORM = 'platform', // Platform-scoped superadmin operations
}
