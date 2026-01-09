import { SetMetadata } from '@nestjs/common';

export const SKIP_IP_RATE_LIMIT_KEY = 'skipIpRateLimit';

export const SkipIpRateLimit = () => SetMetadata(SKIP_IP_RATE_LIMIT_KEY, true);
