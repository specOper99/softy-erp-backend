// IMPORTANT: This file must be imported FIRST in main.ts
// Load environment variables before Sentry init
import * as Sentry from '@sentry/nestjs';
import 'dotenv/config';

// Only initialize if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Disable default PII collection for privacy compliance
    sendDefaultPii: false,
    // Tracing sample rate (10% in production, 100% in dev)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  console.log('Sentry initialized');
} else {
  console.log('Sentry is disabled (SENTRY_DSN not set)');
}
