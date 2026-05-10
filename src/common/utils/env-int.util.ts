/**
 * Parses an env var as a finite integer, falling back to `defaultValue` if the
 * variable is unset, empty, or not a finite number.
 *
 * Replaces the unsafe `parseInt(process.env.X || 'N', 10)` idiom — when X='abc',
 * that pattern returns NaN instead of N because `'abc' || 'N'` short-circuits to
 * 'abc' before parseInt sees it. NaN then propagates into ports, timeouts, pool
 * sizes etc. with cryptic downstream failures.
 */
export function parseEnvInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
