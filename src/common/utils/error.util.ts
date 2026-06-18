/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * JavaScript allows throwing any value, so `error` in a `catch` block is typed
 * as `unknown`. This utility provides a single, consistent extraction path so
 * the same ternary is not repeated across the codebase.
 *
 * Usage:
 *   this.logger.error(`Something failed: ${toErrorMessage(error)}`);
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export function getPostgresErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const code = error['code'];
  return typeof code === 'string' ? code : undefined;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}

export function isDuplicateKeyError(error: unknown): boolean {
  if (isPostgresUniqueViolation(error)) {
    return true;
  }

  if (!isRecord(error)) {
    return false;
  }

  const message = error['message'];
  if (typeof message === 'string' && message.includes('UNIQUE constraint failed')) {
    return true;
  }

  const driverError = error['driverError'];
  if (isRecord(driverError) && driverError['code'] === 'SQLITE_CONSTRAINT') {
    return true;
  }

  return false;
}

export function getPgQueryRowCount(result: unknown): number {
  if (!Array.isArray(result) || result.length < 2) {
    return 0;
  }

  const rows: unknown[] = [];
  for (const entry of result) {
    rows.push(entry);
  }

  const rowCount = rows[1];
  return typeof rowCount === 'number' ? rowCount : 0;
}

/**
 * Redact a PII email address for safe logging.
 * Keeps the domain and the first character of the local part for diagnosability.
 *
 * @example redactEmail('user@example.com') → 'u***@example.com'
 */
export function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '[redacted]';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.charAt(0)}***@${domain}`;
}
