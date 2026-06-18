import 'reflect-metadata';

export { PII_FIELD_PATTERNS } from '../constants/sensitive-log-keys';

/**
 * Decorator to mark fields containing Personally Identifiable Information (PII).
 * Fields marked with @PII() will be masked in logs by the LogSanitizer.
 *
 * Usage:
 * ```typescript
 * class UserDto {
 *   @PII()
 *   email: string;
 *
 *   @PII()
 *   phone: string;
 * }
 * ```
 */
export const PII_METADATA_KEY = 'pii_field';

/**
 * Property decorator that marks a field as containing PII.
 * This decorator stores metadata on the class property that can be
 * retrieved at runtime for log sanitization.
 */
export function PII(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    // Store PII metadata on the class prototype
    const existingPiiFields =
      (Reflect.getMetadata(PII_METADATA_KEY, target.constructor) as (string | symbol)[] | undefined) || [];
    if (!existingPiiFields.includes(propertyKey)) {
      Reflect.defineMetadata(PII_METADATA_KEY, [...existingPiiFields, propertyKey], target.constructor);
    }
  };
}

/**
 * Get the list of PII-marked field names from a class constructor.
 * Useful for runtime log sanitization.
 *
 * @param target - The class constructor to inspect
 * @returns Array of field names marked with @PII()
 */
export function getPiiFields(target: new (...args: unknown[]) => unknown): (string | symbol)[] {
  return (Reflect.getMetadata(PII_METADATA_KEY, target) as (string | symbol)[] | undefined) || [];
}
