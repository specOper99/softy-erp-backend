import * as winston from 'winston';
import { SENSITIVE_KEYS } from '../constants/sensitive-log-keys';

const REDACTED = '[REDACTED]';
const JWT_PATTERN = /^eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*$/;
const TOKEN_PATTERN = /^[A-Za-z0-9+/=_-]+$/;

const isSensitiveKey = (key: string) =>
  SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()));

export function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    if (JWT_PATTERN.test(obj) || (obj.length > 64 && TOKEN_PATTERN.test(obj))) return REDACTED;
    return obj;
  }

  if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item, depth + 1));

  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        isSensitiveKey(key) ? REDACTED : sanitizeObject(value, depth + 1),
      ]),
    );
  }

  return obj;
}

export function sanitizeFormat(): winston.Logform.Format {
  return winston.format((info) => sanitizeObject(info) as winston.Logform.TransformableInfo)();
}
