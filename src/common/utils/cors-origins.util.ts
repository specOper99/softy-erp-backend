type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export function getCorsOriginAllowlist(params: {
  raw: string | undefined;
  /** Set to true for any non-dev, non-test environment (staging, preview, production). */
  requiresOrigins: boolean;
  devFallback: string[];
}): ReadonlySet<string> {
  const raw = params.raw?.trim();
  const candidates =
    raw && raw.length > 0
      ? raw
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

  // Only apply the dev fallback when origins are not required; otherwise leave the
  // list empty so the missing-origins guard below fires for staging environments too.
  const inputs = candidates.length > 0 ? candidates : params.requiresOrigins ? [] : params.devFallback;
  if (params.requiresOrigins && inputs.length === 0) {
    throw new Error(
      'SECURITY: CORS_ORIGINS must be configured in staging/production environments. ' +
        'Set CORS_ORIGINS to a comma-separated list of allowed origins (e.g. https://app.example.com).',
    );
  }

  const normalized: string[] = [];
  for (const value of inputs) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`SECURITY: Invalid CORS origin: ${value}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`SECURITY: CORS origin must be http(s): ${value}`);
    }

    const hasExtraParts = url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0;
    if (hasExtraParts) {
      throw new Error(`SECURITY: CORS origin must not include path/query/hash: ${value}`);
    }

    normalized.push(url.origin);
  }

  return new Set(normalized);
}

export function corsOriginDelegate(allowlist: ReadonlySet<string>) {
  return (origin: string | undefined, callback: CorsOriginCallback) => {
    // Non-browser clients may not send Origin; CORS doesn't apply.
    if (!origin) {
      return callback(null, true);
    }

    let normalized: string;
    try {
      normalized = new URL(origin).origin;
    } catch {
      return callback(null, false);
    }

    return callback(null, allowlist.has(normalized));
  };
}
