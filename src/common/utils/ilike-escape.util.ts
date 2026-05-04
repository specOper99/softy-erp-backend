import type { SelectQueryBuilder } from 'typeorm';

/**
 * Escape special ILIKE pattern characters in a user-supplied search string.
 *
 * PostgreSQL ILIKE treats `%` (any sequence of characters) and `_` (any single
 * character) as wildcards, and `\` as the escape character. Without escaping,
 * user input like "100%" or "a_b" will match unintended rows, and an input
 * consisting only of wildcards could cause the DB to scan every row.
 *
 * Usage:
 *   qb.andWhere('entity.name ILIKE :search ESCAPE \'\\\\\'', { search: `%${escapeLike(input)}%` });
 *
 * The `ESCAPE '\\'` clause tells PostgreSQL that `\` is the escape character.
 */
export function escapeLike(value: string): string {
  // Escape backslash first (it is the escape character), then % and _
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Safely apply an ILIKE search condition across multiple columns.
 *
 * - Trims and caps the search term to `maxLength` characters (default 100).
 * - Requires at least `minLength` characters after trimming (default 1).
 * - Escapes all ILIKE special characters via `escapeLike`.
 * - Uses a unique parameter key per call to avoid conflicts when the helper
 *   is called multiple times on the same QueryBuilder.
 *
 * @param qb      The TypeORM SelectQueryBuilder to add the WHERE clause to.
 * @param columns Fully-qualified column expressions, e.g. `['client.name', 'client.email']`.
 * @param term    The raw user-supplied search string.
 * @param opts    Optional length constraints.
 * @returns `true` if the condition was applied, `false` if the term was too short.
 *
 * @example
 *   applyIlikeSearch(qb, ['client.name', 'client.email', 'booking.notes'], filters.search);
 */
let _ilikeCallCounter = 0;
export function applyIlikeSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qb: SelectQueryBuilder<any>,
  columns: string[],
  term: string,
  { minLength = 1, maxLength = 100 }: { minLength?: number; maxLength?: number } = {},
): boolean {
  const safe = term.trim().slice(0, maxLength);
  if (safe.length < minLength) return false;

  // Use a unique param name per call to support multiple applyIlikeSearch
  // invocations on the same QueryBuilder without parameter name collisions.
  const paramKey = `_ilikeSearch${++_ilikeCallCounter}`;
  const escaped = escapeLike(safe);
  const condition = columns.map((col) => `${col} ILIKE :${paramKey} ESCAPE '\\\\'`).join(' OR ');
  qb.andWhere('(' + condition + ')');
  qb.setParameter(paramKey, `%${escaped}%`);
  return true;
}
