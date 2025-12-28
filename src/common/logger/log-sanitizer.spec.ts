import { sanitizeFormat, sanitizeObject } from './log-sanitizer';

describe('LogSanitizer', () => {
  it('should redact sensitive keys case-insensitively', () => {
    const input = {
      user: 'testuser',
      password: 'mypassword',
      PASSWORD: 'UPPERPASSWORD',
      secret_key: 'topsecret',
      nested: {
        token: 'sensitive-token',
      },
    };

    const result = sanitizeObject(input) as any;

    expect(result.user).toBe('testuser');
    expect(result.password).toBe('[REDACTED]');
    expect(result.PASSWORD).toBe('[REDACTED]');
    expect(result.secret_key).toBe('[REDACTED]');
    expect(result.nested.token).toBe('[REDACTED]');
  });

  it('should redact JWT-like strings', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = sanitizeObject(jwt);
    expect(result).toBe('[REDACTED]');
  });

  it('should return non-object/non-array as is', () => {
    expect(sanitizeObject('string')).toBe('string');
    expect(sanitizeObject(123)).toBe(123);
    expect(sanitizeObject(null)).toBe(null);
  });

  it('should provide a winston format that sanitizes', () => {
    const format = sanitizeFormat();
    const info = { level: 'info', message: 'test', password: 'secret' } as any;
    const result = format.transform(info, {});
    expect((result as any).password).toBe('[REDACTED]');
  });

  it('should redact long base64/hex-like strings', () => {
    const longString = 'a'.repeat(65);
    const result = sanitizeObject(longString);
    expect(result).toBe('[REDACTED]');
  });

  it('should not redact short non-sensitive strings', () => {
    const normalString = 'hello world';
    const result = sanitizeObject(normalString);
    expect(result).toBe('hello world');
  });

  it('should handle null and undefined', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
  });

  it('should handle arrays', () => {
    const input = ['normal', 'password', 'mypassword'];
    const result = sanitizeObject(input) as any[];
    expect(result[0]).toBe('normal');
    // Note: the value itself isn't redacted unless it matches JWT/base64 patterns
    // OR it's a value associated with a sensitive KEY in an object.
    // In an array, we only redact if the string itself looks like a token.
    expect(result[2]).toBe('mypassword');
  });

  it('should protect against infinite recursion', () => {
    const obj: any = { name: 'circular' };
    obj.self = obj;

    const result = sanitizeObject(obj) as any;
    expect(result.name).toBe('circular');
    // It should hit MAX_DEPTH at level 11
    // Our mock structure: depth 0 (root), 1 (self), 2 (self.self)...
    // The implementation returns '[MAX_DEPTH]' for depth > 10.
  });
});
