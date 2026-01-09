import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

export type TranslationKey = string;
export type Language = 'en' | 'ar' | 'ku' | 'fr';

interface TranslationData {
  [key: string]: string | TranslationData;
}

@Injectable()
export class I18nService implements OnModuleInit {
  private readonly logger = new Logger(I18nService.name);
  private translations: Map<Language, TranslationData> = new Map();
  private defaultLanguage: Language = 'en';
  private supportedLanguages: Language[] = ['en', 'ar', 'ku', 'fr'];

  onModuleInit() {
    this.loadTranslations();
  }

  private loadTranslations(): void {
    const translationsDir = join(__dirname, 'translations');

    for (const lang of this.supportedLanguages) {
      try {
        const filePath = join(translationsDir, `${lang}.json`);
        const content = readFileSync(filePath, 'utf-8');
        this.translations.set(lang, JSON.parse(content) as TranslationData);
      } catch {
        this.logger.warn(`Failed to load translations for language: ${lang}`);
      }
    }
  }

  getSupportedLanguages(): Language[] {
    return this.supportedLanguages;
  }

  getDefaultLanguage(): Language {
    return this.defaultLanguage;
  }

  parseAcceptLanguage(header: string | undefined): Language {
    if (!header) return this.defaultLanguage;

    const languages = header
      .split(',')
      .map((part) => {
        const [lang, quality] = part.trim().split(';q=');
        return {
          lang: lang.split('-')[0].toLowerCase(),
          quality: quality ? parseFloat(quality) : 1.0,
        };
      })
      .sort((a, b) => b.quality - a.quality);

    for (const { lang } of languages) {
      if (this.supportedLanguages.includes(lang as Language)) {
        return lang as Language;
      }
    }

    return this.defaultLanguage;
  }

  translate(
    key: TranslationKey,
    lang: Language = this.defaultLanguage,
    params?: Record<string, string | number>,
  ): string {
    const translations =
      this.translations.get(lang) ||
      this.translations.get(this.defaultLanguage);

    if (!translations) {
      return key;
    }

    const value = this.getNestedValue(translations, key);

    if (typeof value !== 'string') {
      return key;
    }

    if (!params) {
      return value;
    }

    // Replace placeholders like {name} with actual values
    return value.replace(/{(\w+)}/g, (_, paramKey: string) => {
      const paramValue = params[paramKey];
      return paramValue !== undefined ? String(paramValue) : `{${paramKey}}`;
    });
  }

  private getNestedValue(
    obj: TranslationData,
    path: string,
  ): string | TranslationData | undefined {
    const keys = path.split('.');
    let current: string | TranslationData | undefined = obj;

    for (const key of keys) {
      if (current === undefined || typeof current === 'string') {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  t(
    key: TranslationKey,
    lang?: Language,
    params?: Record<string, string | number>,
  ): string {
    return this.translate(key, lang, params);
  }
}
