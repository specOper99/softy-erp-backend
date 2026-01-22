import { ConfigService } from '@nestjs/config';
import { CursorAuthService } from './cursor-auth.service';

describe('CursorAuthService', () => {
  let service: CursorAuthService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'CURSOR_SECRET') return 'test-cursor-secret-key-32-chars-min';
        if (key === 'JWT_SECRET') return defaultValue;
        return defaultValue;
      }),
    };

    service = new CursorAuthService(mockConfigService as ConfigService);
  });

  describe('encode and decode', () => {
    it('should encode and decode cursor data correctly', () => {
      const data = '2026-01-18T12:00:00.000Z|uuid-123-456';

      const encoded = service.encode(data);
      const decoded = service.decode(encoded);

      expect(encoded).toBeDefined();
      expect(decoded).toEqual(data);
    });

    it('should produce URL-safe cursor', () => {
      const data = '2026-01-18T12:00:00.000Z|uuid-123-456';

      const encoded = service.encode(data);

      // Base64URL should not contain +, /, or =
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('should reject tampered cursor', () => {
      const data = '2026-01-18T12:00:00.000Z|uuid-123-456';
      const encoded = service.encode(data);

      // Tamper with the cursor
      const tampered = encoded.slice(0, -1) + 'X';
      const decoded = service.decode(tampered);

      expect(decoded).toBeNull();
    });

    it('should reject invalid base64url', () => {
      const decoded = service.decode('not-valid-base64url!!!');

      expect(decoded).toBeNull();
    });

    it('should reject cursor without HMAC separator', () => {
      // Encode just data without pipe separator
      const invalid = Buffer.from('no-pipe-separator').toString('base64url');
      const decoded = service.decode(invalid);

      expect(decoded).toBeNull();
    });

    it('should reject cursor with wrong HMAC', () => {
      const data = '2026-01-18T12:00:00.000Z|uuid-123';
      const wrongHmac = 'deadbeefdeadbeefdeadbeefdeadbeef';
      const payload = `${data}|${wrongHmac}`;
      const encoded = Buffer.from(payload).toString('base64url');

      const decoded = service.decode(encoded);

      expect(decoded).toBeNull();
    });
  });

  describe('decodeOrThrow', () => {
    it('should return decoded data for valid cursor', () => {
      const data = '2026-01-18T12:00:00.000Z|uuid-123-456';
      const encoded = service.encode(data);

      const decoded = service.decodeOrThrow(encoded);

      expect(decoded).toEqual(data);
    });

    it('should throw BadRequestException for invalid cursor', () => {
      expect(() => service.decodeOrThrow('invalid-cursor')).toThrow('Invalid or tampered cursor');
    });
  });

  describe('parseUserCursor', () => {
    it('should parse valid user cursor', () => {
      const date = new Date('2026-01-18T12:00:00.000Z');
      const id = 'uuid-123-456';
      const cursor = service.createUserCursor(date, id);

      const parsed = service.parseUserCursor(cursor);

      expect(parsed).toBeDefined();
      expect(parsed?.date.toISOString()).toEqual(date.toISOString());
      expect(parsed?.id).toEqual(id);
    });

    it('should return null for tampered cursor', () => {
      const date = new Date();
      const cursor = service.createUserCursor(date, 'uuid-123');
      const tampered = cursor + 'X';

      const parsed = service.parseUserCursor(tampered);

      expect(parsed).toBeNull();
    });

    it('should return null for cursor with invalid date format', () => {
      const data = 'not-a-date|uuid-123';
      const encoded = service.encode(data);

      const parsed = service.parseUserCursor(encoded);

      expect(parsed).toBeNull();
    });

    it('should return null for cursor without ID', () => {
      const data = '2026-01-18T12:00:00.000Z';
      const encoded = service.encode(data);

      const parsed = service.parseUserCursor(encoded);

      expect(parsed).toBeNull();
    });
  });

  describe('createUserCursor', () => {
    it('should create valid authenticated cursor', () => {
      const date = new Date('2026-01-18T12:00:00.000Z');
      const id = 'uuid-123-456';

      const cursor = service.createUserCursor(date, id);

      expect(cursor).toBeDefined();
      expect(cursor).not.toMatch(/[+/=]/); // URL-safe

      // Verify it can be decoded
      const parsed = service.parseUserCursor(cursor);
      expect(parsed?.id).toEqual(id);
    });
  });
});
