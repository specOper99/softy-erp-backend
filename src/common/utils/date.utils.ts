/**
 * Date utility functions with strict type safety
 */

/**
 * Safely extract date string (YYYY-MM-DD) from ISO string.
 * Handles noUncheckedIndexedAccess by providing a fallback.
 */
export function getDateString(date: Date): string {
  const isoString = date.toISOString();
  const datePart = isoString.split('T')[0];
  return datePart ?? isoString.slice(0, 10);
}

/**
 * Format Date for display purposes
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return getDateString(d);
}
