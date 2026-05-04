import type { Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { I18nService } from 'nestjs-i18n';

/** Body shape thrown by ApiErrors / ValidationPipe (avoid collision with Nest defaults). */
export const API_ERROR_CODE = 'code';
export const API_ERROR_ARGS = 'args';
export const API_VALIDATION_ERRORS = 'validationErrors';

export interface ApiValidationErrorItem {
  property: string;
  code: string;
}

let cachedRegisteredKeys: Set<string> | undefined;

/**
 * Flattened leaf keys from en.json — used only to detect server-side i18n codes in exception strings.
 * Never used with arbitrary user input as translation input (only membership check).
 */
export function getRegisteredApiErrorKeys(): Set<string> {
  if (!cachedRegisteredKeys) {
    const enPath = path.join(__dirname, 'translations', 'en.json');
    const raw = fs.readFileSync(enPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    cachedRegisteredKeys = flattenLeafKeys(parsed);
  }
  return cachedRegisteredKeys;
}

function flattenLeafKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const x of flattenLeafKeys(v as Record<string, unknown>, next)) keys.add(x);
    } else {
      keys.add(next);
    }
  }
  return keys;
}

export type ApiErrorArgs = Record<string, string | number | boolean>;

function isMissingTranslation(output: string, key: string): boolean {
  return output === key || output.trim() === '';
}

/**
 * Translates an API error code with locale → English → generic fallback.
 * Never returns the raw `code` string as the user-facing message.
 */
export function translateApiErrorMessage(
  i18n: I18nService,
  code: string,
  args: ApiErrorArgs | undefined,
  lang: string,
  logger?: Logger,
): string {
  const translate = (translationKey: string, locale: string): string => {
    const result = i18n.translate(translationKey, {
      lang: locale,
      args: args as Record<string, unknown> | undefined,
    }) as string;
    return typeof result === 'string' ? result : String(result);
  };

  let message = translate(code, lang);
  if (isMissingTranslation(message, code) && lang !== 'en') {
    message = translate(code, 'en');
  }

  if (isMissingTranslation(message, code)) {
    logger?.warn({ msg: 'Missing API error translation', code, lang });
    message = translate('common.message_unavailable', lang);
    if (isMissingTranslation(message, 'common.message_unavailable')) {
      message = translate('common.message_unavailable', 'en');
    }
    if (isMissingTranslation(message, 'common.message_unavailable')) {
      message = translate('common.internal_error', 'en');
    }
  }

  return message;
}

/**
 * Parse legacy ValidationPipe lines: `email: validation.invalid_email`
 */
export function parseLegacyValidationLine(line: string): { property: string; code: string } | undefined {
  const idx = line.indexOf(': ');
  if (idx <= 0) return undefined;
  const property = line.slice(0, idx).trim();
  const code = line.slice(idx + 2).trim();
  if (!property || !code.includes('.')) return undefined;
  return { property, code };
}

export function translateValidationFieldMessage(
  i18n: I18nService,
  property: string,
  code: string,
  lang: string,
  logger?: Logger,
): string {
  const args: ApiErrorArgs = { field: property };
  return translateApiErrorMessage(i18n, code, args, lang, logger);
}
