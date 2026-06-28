import 'reflect-metadata';
import { PII_FIELD_PATTERNS, PII_METADATA_KEY } from '../decorators/pii.decorator';

export class LogSanitizer {
  private static readonly MASK = '***';

  static sanitize(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item));

    const sanitized: Record<string, unknown> = {};
    const constructor = value.constructor;
    const piiFields = (Reflect.getMetadata(PII_METADATA_KEY, constructor) as string[]) || [];

    for (const key of Object.keys(value as Record<string, unknown>)) {
      const val = (value as Record<string, unknown>)[key];
      const isPii = piiFields.includes(key) || this.matchesPiiPattern(key);
      sanitized[key] = isPii ? this.MASK : typeof val === 'object' && val !== null ? this.sanitize(val) : val;
    }

    return sanitized;
  }

  private static matchesPiiPattern(key: string): boolean {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return PII_FIELD_PATTERNS.includes(lowerKey);
  }
}
