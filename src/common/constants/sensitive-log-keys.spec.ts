import { PII_FIELD_PATTERNS, SENSITIVE_KEYS } from './sensitive-log-keys';

describe('sensitive-log-keys', () => {
  it('derives normalized PII patterns from every sensitive key', () => {
    expect(PII_FIELD_PATTERNS).toHaveLength(SENSITIVE_KEYS.length);

    for (const key of SENSITIVE_KEYS) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      expect(PII_FIELD_PATTERNS).toContain(normalized);
    }
  });

  it('includes core auth and financial identifiers', () => {
    expect(SENSITIVE_KEYS).toEqual(
      expect.arrayContaining(['password', 'accessToken', 'refresh_token', 'creditCard', 'ssn', 'ipAddress']),
    );
    expect(PII_FIELD_PATTERNS).toEqual(
      expect.arrayContaining(['password', 'accesstoken', 'refreshtoken', 'creditcard', 'ssn', 'ipaddress']),
    );
  });
});
