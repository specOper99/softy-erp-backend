const SUPPORTED_LANGUAGES = new Set(['en', 'ar', 'ku', 'fr']);

export function resolveLanguageFromHeader(acceptLanguage: string | undefined): string {
  if (!acceptLanguage) return 'en';
  for (const part of acceptLanguage.split(',')) {
    const raw = (part.split(';')[0] ?? '').trim().toLowerCase();
    if (SUPPORTED_LANGUAGES.has(raw)) return raw;
    const base = raw.split('-')[0] ?? '';
    if (SUPPORTED_LANGUAGES.has(base)) return base;
  }
  return 'en';
}
