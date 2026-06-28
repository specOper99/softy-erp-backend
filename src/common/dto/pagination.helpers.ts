export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function clampPageLimit(value: unknown, fallback = DEFAULT_PAGE_LIMIT): number {
  const n = Number.isFinite(value) ? (value as number) : fallback;
  return Math.max(1, Math.min(MAX_PAGE_LIMIT, n));
}

export function pageToSkip(page: unknown, limit: unknown): number {
  const p = Number.isFinite(page) ? (page as number) : 1;
  return Math.max(0, (p - 1) * clampPageLimit(limit));
}
