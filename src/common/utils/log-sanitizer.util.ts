import 'reflect-metadata';
import {
  PII_FIELD_PATTERNS,
  PII_METADATA_KEY,
} from '../decorators/pii.decorator';

export class LogSanitizer {
  private static readonly MASK = '***';

  /**
   * Recursively sanitizes an object, masking fields marked with @PII
   * or matching common PII patterns.
   */
  static sanitize(value: unknown): unknown {
    if (!value) return value;
    if (typeof value !== 'object') return value;

    // Handle Arrays
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    // Handle Objects
    const sanitized: Record<string, unknown> = {};

    // Get PII fields from metadata if the object is an instance of a class
    const constructor = value.constructor;
    const piiFields =
      (Reflect.getMetadata(PII_METADATA_KEY, constructor) as string[]) || [];

    for (const key of Object.keys(value as Record<string, unknown>)) {
      const val = (value as Record<string, unknown>)[key];

      // Check if field is marked via Decorator OR Pattern match
      const isPii = piiFields.includes(key) || this.matchesPiiPattern(key);

      if (isPii) {
        sanitized[key] = this.MASK;
      } else if (typeof val === 'object' && val !== null) {
        // Recurse
        sanitized[key] = this.sanitize(val);
      } else {
        sanitized[key] = val;
      }
    }

    return sanitized;
  }

  private static matchesPiiPattern(key: string): boolean {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return PII_FIELD_PATTERNS.includes(lowerKey);
  }
}
