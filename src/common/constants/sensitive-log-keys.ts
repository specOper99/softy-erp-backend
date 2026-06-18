/**
 * Shared sensitive field names for log redaction (Winston sanitizer + LogSanitizer util).
 * Case-insensitive substring matching is applied at call sites.
 */
export const SENSITIVE_KEYS = [
  // Authentication & secrets
  'password',
  'passwordHash',
  'password_hash',
  'secret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'bearer',
  'apiKey',
  'api_key',
  'vault',
  // PII - Personal identifiers
  'email',
  'phone',
  'ssn',
  'socialSecurity',
  'social_security',
  // PII - Financial
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'accountNumber',
  'account_number',
  'routingNumber',
  'routing_number',
  // PII - Date of birth
  'dob',
  'dateOfBirth',
  'date_of_birth',
  'birthDate',
  'birth_date',
  // Network identifiers
  'ipAddress',
  'ip_address',
] as const;

/**
 * Normalized PII field patterns (lowercase, no separators) for LogSanitizer decorator matching.
 */
export const PII_FIELD_PATTERNS: string[] = SENSITIVE_KEYS.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, ''));
