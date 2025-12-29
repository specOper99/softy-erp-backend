import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditOptions {
  action: string;
  resource: string;
  /**
   * If true, includes request body in audit log.
   * Be careful with sensitive data!
   */
  includeBody?: boolean;
  /**
   * If true, includes response data in audit log.
   */
  includeResponse?: boolean;
}

/**
 * Decorator to mark endpoints for automatic audit logging.
 * Works with the AuditInterceptor to log sensitive operations.
 *
 * @example
 * @Audit({ action: 'UPDATE', resource: 'user' })
 * @Patch(':id')
 * updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
 *   return this.usersService.update(id, dto);
 * }
 */
export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_KEY, options);
