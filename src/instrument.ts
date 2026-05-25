// IMPORTANT: This file must be imported FIRST in main.ts
// Load environment variables before Sentry init
import * as Sentry from '@sentry/nestjs';
import 'dotenv/config';

class SentryLogger {
  static log(message: string): void {
    process.stdout.write(`[Sentry] ${message}\n`);
  }
}

// Only initialize if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Disable default PII collection for privacy compliance
    sendDefaultPii: false,
    // Tracing sample rate (10% in production, 100% in dev)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  } as Parameters<typeof Sentry.init>[0]);
  SentryLogger.log('Sentry initialized');
} else {
  SentryLogger.log('Sentry is disabled (SENTRY_DSN not set)');
}

// Catch unhandled promise rejections and uncaught exceptions that escape
// Sentry's request-scoped handlers (e.g. async init code, background jobs).
process.on('unhandledRejection', (reason: unknown) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason);
  }
  process.stderr.write(`[unhandledRejection] ${String(reason)}\n`);
  // Exit so the process manager (Docker/k8s) restarts into a clean state.
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
  process.stderr.write(`[uncaughtException] ${error.message}\n`);
  process.exit(1);
});
