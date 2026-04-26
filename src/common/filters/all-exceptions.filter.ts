import type { ArgumentsHost } from '@nestjs/common';
import { Catch, ExceptionFilter, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';
import { getCorrelationId } from '../logger/request-context';

interface ErrorResponse {
  statusCode: number;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
  method: string;
}

interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Inject(I18nService)
    private readonly i18nService: I18nService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelationId>();

    const isProduction = process.env.NODE_ENV === 'production';
    const correlationId = this.resolveCorrelationId(request);
    response.setHeader('X-Correlation-ID', correlationId);

    // Resolve language from nestjs-i18n context (set by AcceptLanguageResolver middleware)
    const lang = I18nContext.current(host)?.lang ?? 'en';

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as {
          message?: string | string[];
          error?: string;
        };
        const msg = responseObj.message || exception.message;
        message = this.formatMessage(msg);
      } else {
        message = String(exceptionResponse);
      }

      // Try to translate the message if it appears to be an error message
      const translated = this.tryTranslateMessage(message, lang);
      if (translated !== message) {
        message = translated;
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      // Translate the generic error message
      message = this.i18nService.translate('common.internal_error', { lang });

      this.logger.error({
        message: 'Unhandled exception',
        correlationId,
        error: exception.message,
        stack: isProduction ? undefined : exception.stack,
        path: request.url,
        method: request.method,
        ipAddress: request.ip,
      });
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      // Translate the generic error message
      message = this.i18nService.translate('common.internal_error', { lang });

      this.logger.error({
        message: 'Unknown exception type',
        correlationId,
        path: request.url,
        method: request.method,
      });
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    response.status(status).json(errorResponse);
  }

  private formatMessage(msg: string | string[]): string {
    if (Array.isArray(msg)) {
      return msg.join(', ');
    }
    return String(msg);
  }

  /**
   * Try to translate a message. Returns the translated message if found,
   * or the original message if no translation exists.
   */
  private tryTranslateMessage(message: string, lang: string): string {
    // Map common generic error messages to translation keys
    const messageKeyMap: Record<string, string> = {
      'An unexpected error occurred. Please try again later.': 'common.internal_error',
      'Unhandled exception': 'common.internal_error',
      'Unknown exception': 'common.internal_error',
    };

    const translationKey = messageKeyMap[message];
    if (translationKey) {
      return this.i18nService.translate(translationKey, { lang });
    }

    // Try to translate the message directly (assuming it might be a key)
    const translated = this.i18nService.translate(message, { lang }) as string;
    if (translated !== message) {
      return translated;
    }

    // Return original message if no translation found
    return message;
  }

  private resolveCorrelationId(request: RequestWithCorrelationId): string {
    const headerValue = request.headers['x-correlation-id'];
    const headerCorrelationId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    const correlationIdCandidates = [headerCorrelationId, request.correlationId, getCorrelationId()];

    for (const candidate of correlationIdCandidates) {
      const value = this.validateCorrelationId(candidate);
      if (value) return value;
    }

    return this.generateCorrelationId();
  }

  private validateCorrelationId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > 128) return undefined;

    // Allow a safe subset of characters to prevent log injection / header abuse
    if (!/^[a-zA-Z0-9._:-]+$/.test(trimmed)) return undefined;

    return trimmed;
  }

  private generateCorrelationId(): string {
    return randomUUID();
  }
}
