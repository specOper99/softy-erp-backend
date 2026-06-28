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
  if (!isRecord(error)) return undefined;
  const code = error['code'];
  return typeof code === 'string' ? code : undefined;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}

export function isDuplicateKeyError(error: unknown): boolean {
  if (isPostgresUniqueViolation(error)) return true;
  if (!isRecord(error)) return false;

  const message = error['message'];
  if (typeof message === 'string' && message.includes('UNIQUE constraint failed')) return true;

  const driverError = error['driverError'];
  return isRecord(driverError) && driverError['code'] === 'SQLITE_CONSTRAINT';
}

export function getPgQueryRowCount(result: unknown): number {
  if (!Array.isArray(result) || result.length < 2) return 0;
  const rowCount: unknown = result[1];
  return typeof rowCount === 'number' ? rowCount : 0;
}

/** Redact email for logging: `user@example.com` → `u***@example.com` */
export function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '[redacted]';
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}
