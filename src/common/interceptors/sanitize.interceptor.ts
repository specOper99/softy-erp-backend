import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

/**
 * Sanitization interceptor that escapes HTML entities in string fields
 * to prevent XSS attacks. Applied globally to all incoming requests.
 */
@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.body && typeof request.body === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      request.body = this.sanitizeObject(request.body);
    }

    return next.handle();
  }

  /**
   * Recursively sanitize an object's string values
   */
  private sanitizeObject(obj: unknown): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.escapeHtml(obj);
    }

    if (Array.isArray(obj)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return str.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
  }
}
