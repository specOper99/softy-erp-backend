/**
 * Log Sanitizer - Redacts sensitive data from log output
 */
import * as winston from 'winston';

// Sensitive keys to redact (case-insensitive)
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'api_key',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'ssn',
  'socialSecurity',
  'roleId',
  'role_id',
  'vault',
];

const REDACTED = '[REDACTED]';

/**
 * Check if a key should be redacted
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) =>
    lowerKey.includes(sensitive.toLowerCase()),
  );
}

/**
 * Recursively sanitize an object, redacting sensitive values
 */
export function sanitizeObject(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) {
    return '[MAX_DEPTH]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Redact tokens that look like JWTs
    if (obj.match(/^eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*$/)) {
      return REDACTED;
    }
    // Redact base64-encoded strings that might be tokens (64+ chars)
    if (obj.length > 64 && obj.match(/^[A-Za-z0-9+/=_-]+$/)) {
      return REDACTED;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Winston format transformer that sanitizes logs
 */
export function sanitizeFormat(): winston.Logform.Format {
  return winston.format((info) => {
    return sanitizeObject(info) as winston.Logform.TransformableInfo;
  })();
}
