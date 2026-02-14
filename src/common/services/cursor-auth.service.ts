/**
 * CursorAuthService - HMAC-authenticated cursor encoding
 *
 * This service provides cryptographically signed cursor pagination
 * to prevent cursor manipulation attacks.
 *
 * Key features:
 * - HMAC-SHA256 authentication using a secret key
 * - Timing-safe comparison to prevent timing attacks
 * - Base64URL encoding (URL-safe, no escaping needed)
 * - Automatic validation of cursor integrity
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class CursorAuthService {
  private readonly logger = new Logger(CursorAuthService.name);
  private readonly secret: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secretStr = this.configService.get<string>('CURSOR_SECRET') || this.configService.get<string>('JWT_SECRET');

    if (!secretStr) {
      throw new Error('CURSOR_SECRET or JWT_SECRET must be configured');
    }

    this.secret = Buffer.from(secretStr, 'utf-8');
  }

  /**
   * Encode cursor data with HMAC authentication.
   *
   * The resulting cursor format is:
   * base64url(data|hmac)
   *
   * @param data - The cursor data to encode (e.g., "2026-01-18T12:00:00Z|uuid-123")
   * @returns Base64URL-encoded authenticated cursor
   */
  encode(data: string): string {
    const hmac = createHmac('sha256', this.secret).update(data).digest('hex');
    const payload = `${data}|${hmac}`;
    return Buffer.from(payload).toString('base64url');
  }

  /**
   * Decode and verify cursor authenticity.
   *
   * Validates the HMAC signature to ensure the cursor
   * hasn't been tampered with.
   *
   * @param cursor - The base64url-encoded cursor
   * @returns The original cursor data if valid, null if tampered
   */
  decode(cursor: string): string | null {
    try {
      const payload = Buffer.from(cursor, 'base64url').toString('utf-8');
      const lastPipe = payload.lastIndexOf('|');

      if (lastPipe === -1) {
        return null;
      }

      const data = payload.slice(0, lastPipe);
      const providedHmac = payload.slice(lastPipe + 1);

      const expectedHmac = createHmac('sha256', this.secret).update(data).digest('hex');

      // Timing-safe comparison to prevent timing attacks
      try {
        if (!timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) {
          return null;
        }
      } catch (error) {
        // Length mismatch throws an error
        this.logger.debug(
          `Cursor HMAC comparison failed: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'}`,
        );
        return null;
      }

      return data;
    } catch (error) {
      this.logger.debug(
        `Cursor decode failed: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Decode cursor or throw BadRequestException if invalid.
   *
   * @param cursor - The base64url-encoded cursor
   * @returns The original cursor data
   * @throws BadRequestException if cursor is invalid or tampered
   */
  decodeOrThrow(cursor: string): string {
    const data = this.decode(cursor);

    if (data === null) {
      throw new BadRequestException('Invalid or tampered cursor');
    }

    return data;
  }

  /**
   * Parse a decoded cursor into date and ID components.
   *
   * Expects format: "ISO-date|uuid"
   *
   * @param cursor - The encoded cursor
   * @returns Object with date and id, or null if invalid
   */
  parseUserCursor(cursor: string): { date: Date; id: string } | null {
    const decoded = this.decode(cursor);

    if (!decoded) {
      return null;
    }

    const [dateStr, id] = decoded.split('|');

    if (!dateStr || !id) {
      return null;
    }

    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
      return null;
    }

    return { date, id };
  }

  /**
   * Create an authenticated cursor for user pagination.
   *
   * @param date - The cursor date (typically createdAt)
   * @param id - The cursor ID (typically entity ID)
   * @returns Base64URL-encoded authenticated cursor
   */
  createUserCursor(date: Date, id: string): string {
    const data = `${date.toISOString()}|${id}`;
    return this.encode(data);
  }
}
