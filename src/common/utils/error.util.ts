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

/**
 * Redact a PII email address for safe logging.
 * Keeps the domain and the first character of the local part for diagnosability.
 *
 * @example redactEmail('user@example.com') → 'u***@example.com'
 */
export function redactEmail(email: string): string {
  if (!email || !email.includes('@')) return '[redacted]';
  const [local, domain] = email.split('@') as [string, string];
  return `${local.charAt(0)}***@${domain}`;
}
