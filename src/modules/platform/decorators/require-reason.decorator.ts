import { SetMetadata } from '@nestjs/common';

export const REQUIRE_REASON_KEY = 'require_reason';

/**
 * Decorator to require a reason for sensitive operations
 */
export const RequireReason = () => SetMetadata(REQUIRE_REASON_KEY, true);
