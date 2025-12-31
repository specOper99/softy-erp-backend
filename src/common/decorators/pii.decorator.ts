import 'reflect-metadata';

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
      (Reflect.getMetadata(PII_METADATA_KEY, target.constructor) as
        | (string | symbol)[]
        | undefined) || [];
    if (!existingPiiFields.includes(propertyKey)) {
      Reflect.defineMetadata(
        PII_METADATA_KEY,
        [...existingPiiFields, propertyKey],
        target.constructor,
      );
    }
  };
}

/**
 * List of common PII field names that should always be masked in logs,
 * even without the @PII decorator.
 */
export const PII_FIELD_PATTERNS = [
  'email',
  'phone',
  'ssn',
  'social_security',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'password',
  'passwordhash',
  'password_hash',
  'secret',
  'token',
  'apikey',
  'api_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'bearer',
  'ipaddress',
  'ip_address',
  'dob',
  'dateofbirth',
  'date_of_birth',
  'birthdate',
  'birth_date',
];

/**
 * Get the list of PII-marked field names from a class constructor.
 * Useful for runtime log sanitization.
 *
 * @param target - The class constructor to inspect
 * @returns Array of field names marked with @PII()
 */
export function getPiiFields(
  target: new (...args: unknown[]) => unknown,
): (string | symbol)[] {
  return (
    (Reflect.getMetadata(PII_METADATA_KEY, target) as
      | (string | symbol)[]
      | undefined) || []
  );
}
