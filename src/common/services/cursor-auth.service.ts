/** HMAC-SHA256 signed cursor pagination (timing-safe, base64url). */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RuntimeFailure } from '../errors/runtime-failure';
import { toErrorMessage } from '../utils/error.util';

@Injectable()
export class CursorAuthService {
  private readonly logger = new Logger(CursorAuthService.name);
  private readonly secret: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secretStr = this.configService.get<string>('CURSOR_SECRET') || this.configService.get<string>('JWT_SECRET');
    if (!secretStr) throw new RuntimeFailure('CURSOR_SECRET or JWT_SECRET must be configured');
    this.secret = Buffer.from(secretStr, 'utf-8');
  }

  encode(data: string): string {
    const hmac = createHmac('sha256', this.secret).update(data).digest('hex');
    return Buffer.from(`${data}|${hmac}`).toString('base64url');
  }

  decode(cursor: string): string | null {
    try {
      const payload = Buffer.from(cursor, 'base64url').toString('utf-8');
      const lastPipe = payload.lastIndexOf('|');
      if (lastPipe === -1) return null;

      const data = payload.slice(0, lastPipe);
      const providedHmac = payload.slice(lastPipe + 1);
      const expectedHmac = createHmac('sha256', this.secret).update(data).digest('hex');

      try {
        if (!timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) return null;
      } catch (error) {
        this.logger.debug(`Cursor HMAC comparison failed: ${toErrorMessage(error)}`);
        return null;
      }
      return data;
    } catch (error) {
      this.logger.debug(`Cursor decode failed: ${toErrorMessage(error)}`);
      return null;
    }
  }

  decodeOrThrow(cursor: string): string {
    const data = this.decode(cursor);
    if (data === null) throw new BadRequestException('cursor.tampered');
    return data;
  }

  parseUserCursor(cursor: string): { date: Date; id: string } | null {
    const decoded = this.decode(cursor);
    if (!decoded) return null;

    const [dateStr, id] = decoded.split('|');
    if (!dateStr || !id) return null;

    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? null : { date, id };
  }

  createUserCursor(date: Date, id: string): string {
    return this.encode(`${date.toISOString()}|${id}`);
  }
}
