import { SetMetadata } from '@nestjs/common';
import { MFA_REQUIRED_KEY } from '../guards/mfa-required.guard';

/**
 * Decorator to mark endpoints that require MFA to be enabled.
 * Only applies to roles configured in MFA_REQUIRED_ROLES env variable.
 *
 * @example
 * ```typescript
 * @MfaRequired()
 * @Post('sensitive-operation')
 * async sensitiveOperation() {
 *   // Only users with MFA enabled can access this
 * }
 * ```
 */
export const MfaRequired = () => SetMetadata(MFA_REQUIRED_KEY, true);
