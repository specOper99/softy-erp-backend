import type { ArgumentsHost } from '@nestjs/common';
import { Catch, ExceptionFilter, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { randomUUID } from 'node:crypto';
import { getCorrelationId } from '../logger/request-context';
import {
  API_ERROR_ARGS,
  API_ERROR_CODE,
  API_VALIDATION_ERRORS,
  getRegisteredApiErrorKeys,
  parseLegacyValidationLine,
  translateApiErrorMessage,
  translateValidationFieldMessage,
  type ApiErrorArgs,
  type ApiValidationErrorItem,
} from '../i18n/api-error-translation';

interface FieldErrorEntry {
  field: string;
  code: string;
  message: string;
}

interface ErrorResponse {
  statusCode: number;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
  method: string;
  code?: string;
  errors?: FieldErrorEntry[];
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

  /** Languages for which we have translation files. */
  private static readonly SUPPORTED_LANGUAGES = new Set<string>(['en', 'ar', 'ku', 'fr']);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelationId>();

    const isProduction = process.env.NODE_ENV === 'production';
    const correlationId = this.resolveCorrelationId(request);
    response.setHeader('X-Correlation-ID', correlationId);

    // Primary: nestjs-i18n context (set by the i18n interceptor for route-handler requests).
    // Fallback: read Accept-Language header directly, which is always present in the raw
    // request — this covers exceptions thrown inside guards/middleware before the i18n
    // interceptor has had a chance to run.
    const i18nLang = I18nContext.current(host)?.lang;
    const lang = i18nLang ?? this.resolveLanguageFromHeader(request.headers['accept-language'] as string | undefined);

    let status: number;
    let message: string;
    let codeOut: string | undefined;
    let fieldErrors: FieldErrorEntry[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resolved = this.resolveHttpException(exception, lang);
      message = resolved.message;
      codeOut = resolved.code;
      fieldErrors = resolved.errors;
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = translateApiErrorMessage(this.i18nService, 'common.internal_error', undefined, lang, this.logger);

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
      message = translateApiErrorMessage(this.i18nService, 'common.internal_error', undefined, lang, this.logger);

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
    if (codeOut) {
      errorResponse.code = codeOut;
    }
    if (fieldErrors && fieldErrors.length > 0) {
      errorResponse.errors = fieldErrors;
    }

    response.status(status).json(errorResponse);
  }

  private resolveHttpException(
    exception: HttpException,
    lang: string,
  ): { message: string; code?: string; errors?: FieldErrorEntry[] } {
    const raw = exception.getResponse();

    if (typeof raw === 'string') {
      return { message: this.resolvePlainStringMessage(raw, lang) };
    }

    if (typeof raw !== 'object' || raw === null) {
      return { message: String(raw) };
    }

    const o = raw as Record<string, unknown>;
    const registered = getRegisteredApiErrorKeys();

    const validationRaw = o[API_VALIDATION_ERRORS];
    if (Array.isArray(validationRaw) && validationRaw.length > 0) {
      let code = 'validation.failed';
      if (typeof o[API_ERROR_CODE] === 'string') {
        code = o[API_ERROR_CODE];
      } else if (typeof o['code'] === 'string') {
        code = o['code'];
      }
      const errors: FieldErrorEntry[] = validationRaw.map((item) => {
        const it = item as ApiValidationErrorItem;
        return {
          field: it.property,
          code: it.code,
          message: translateValidationFieldMessage(this.i18nService, it.property, it.code, lang, this.logger),
        };
      });
      const message = errors.map((e) => e.message).join(', ');
      return { message, code, errors };
    }

    const code = typeof o['code'] === 'string' ? o['code'] : undefined;
    if (code) {
      const args = o[API_ERROR_ARGS] as ApiErrorArgs | undefined;
      const message = translateApiErrorMessage(this.i18nService, code, args, lang, this.logger);
      return { message, code };
    }

    if (Array.isArray(o['message'])) {
      const parts = (o['message'] as string[]).map((line) =>
        this.translateLegacyValidationOrKeyLine(line, lang, registered),
      );
      return { message: parts.join(', ') };
    }

    if (typeof o['message'] === 'string') {
      return { message: this.resolvePlainStringMessage(o['message'], lang) };
    }

    return { message: exception.message };
  }

  private translateLegacyValidationOrKeyLine(line: string, lang: string, registered: Set<string>): string {
    const parsed = parseLegacyValidationLine(line);
    if (parsed && registered.has(parsed.code)) {
      return translateValidationFieldMessage(this.i18nService, parsed.property, parsed.code, lang, this.logger);
    }
    return this.resolvePlainStringMessage(line, lang);
  }

  /**
   * If the string is a registered i18n leaf key, translate it; otherwise return as-is (legacy English).
   */
  private resolvePlainStringMessage(s: string, lang: string): string {
    const keyMap: Record<string, string> = {
      'An unexpected error occurred. Please try again later.': 'common.internal_error',
      'Unhandled exception': 'common.internal_error',
      'Unknown exception': 'common.internal_error',
    };
    const mapped = keyMap[s];
    if (mapped) {
      return translateApiErrorMessage(this.i18nService, mapped, undefined, lang, this.logger);
    }

    const registered = getRegisteredApiErrorKeys();
    if (registered.has(s)) {
      return translateApiErrorMessage(this.i18nService, s, undefined, lang, this.logger);
    }

    return s;
  }

  /**
   * Parse a raw Accept-Language header value (e.g. "ar,en-US;q=0.9") into the
   * first supported language code, falling back to "en".
   */
  private resolveLanguageFromHeader(acceptLanguage: string | undefined): string {
    if (!acceptLanguage) return 'en';
    for (const part of acceptLanguage.split(',')) {
      const raw = (part.split(';')[0] ?? '').trim().toLowerCase();
      if (AllExceptionsFilter.SUPPORTED_LANGUAGES.has(raw)) return raw;
      // Also accept region tags like "ar-SA" → "ar"
      const base = raw.split('-')[0] ?? '';
      if (AllExceptionsFilter.SUPPORTED_LANGUAGES.has(base)) return base;
    }
    return 'en';
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

    if (!/^[a-zA-Z0-9._:-]+$/.test(trimmed)) return undefined;

    return trimmed;
  }

  private generateCorrelationId(): string {
    return randomUUID();
  }
}
