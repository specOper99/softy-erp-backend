import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Language } from '../i18n';

/**
 * @Lang() decorator for controller methods.
 * Extracts the user's preferred language from the Accept-Language HTTP header
 * and returns it as a Language type (en | ar | ku | fr).
 *
 * The decorator parses the Accept-Language header with quality values and
 * returns the highest priority language that we support.
 *
 * Usage:
 *   @Get()
 *   getItems(@Lang() lang: Language) {
 *     return this.service.getItems(lang);
 *   }
 */
export const Lang = createParamDecorator((data: unknown, ctx: ExecutionContext): Language => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const acceptLanguage = request.headers['accept-language'];

  const allLanguages = ['en', 'ar', 'ku', 'fr'] as const;

  if (!acceptLanguage) {
    return 'en';
  }

  // Parse Accept-Language header with quality values
  // Format: "en-US,en;q=0.9,ar;q=0.8"
  const languages = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, qPart] = part.trim().split(';q=');
      const quality = qPart ? parseFloat(qPart) : 1.0;
      const languageCode = (lang?.split('-')[0] ?? '').toLowerCase();
      return { lang: languageCode, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  // Return the first supported language
  for (const { lang } of languages) {
    if (allLanguages.includes(lang as Language)) {
      return lang as Language;
    }
  }

  return 'en';
});
