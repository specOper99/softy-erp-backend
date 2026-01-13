import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nService, Language } from '../i18n';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

interface I18nErrorPayload {
  key: string;
  args?: Record<string, string | number>;
}

interface NestJsErrorResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

type ExceptionResponseType = string | I18nErrorPayload | NestJsErrorResponse;

function isI18nErrorPayload(obj: unknown): obj is I18nErrorPayload {
  return typeof obj === 'object' && obj !== null && 'key' in obj && typeof (obj as I18nErrorPayload).key === 'string';
}

function isNestJsErrorResponse(obj: unknown): obj is NestJsErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    (typeof (obj as NestJsErrorResponse).message === 'string' || Array.isArray((obj as NestJsErrorResponse).message))
  );
}

@Catch(HttpException)
export class I18nExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(I18nService)
    private readonly i18nService: I18nService,
  ) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // Parse Accept-Language header
    const acceptLanguage = request.headers['accept-language'];
    const lang = this.i18nService.parseAcceptLanguage(acceptLanguage);

    // Get the original error message
    const exceptionResponse = exception.getResponse() as ExceptionResponseType;

    let originalMessage = 'Error';
    let args: Record<string, string | number> | undefined;

    if (typeof exceptionResponse === 'string') {
      originalMessage = exceptionResponse;
    } else if (isI18nErrorPayload(exceptionResponse)) {
      // Handle { key: '...', args: { ... } } pattern
      originalMessage = exceptionResponse.key;
      args = exceptionResponse.args;
    } else if (isNestJsErrorResponse(exceptionResponse)) {
      // Handle standard NestJS error object { message: '...', ... }
      if (Array.isArray(exceptionResponse.message)) {
        originalMessage = exceptionResponse.message[0]; // Validation errors often return array
      } else {
        originalMessage = exceptionResponse.message;
      }
    }

    // Try to translate the message
    const translatedMessage = this.translateMessage(originalMessage, lang, args);

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: translatedMessage,
      error: this.getErrorName(status),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  private translateMessage(message: string, lang: Language, args?: Record<string, string | number>): string {
    // Map common error messages to translation keys
    const messageKeyMap: Record<string, string> = {
      Unauthorized: 'common.unauthorized',
      'Unauthorized access': 'common.unauthorized',
      Forbidden: 'common.forbidden',
      'Access forbidden': 'common.forbidden',
      'Not found': 'common.not_found',
      'Bad request': 'common.bad_request',
      'Internal server error': 'common.internal_error',
      'Invalid email or password': 'auth.login_failed',
      'Token has expired': 'auth.token_expired',
      'Invalid token': 'auth.token_invalid',
      'Account is locked. Please try again later': 'auth.account_locked',
      'Booking not found': 'booking.not_found',
      'Task not found': 'task.not_found',
    };

    const translationKey = messageKeyMap[message];
    if (translationKey) {
      return this.i18nService.translate(translationKey, lang, args);
    }

    // Try to translate the message directly (assuming it might be a key)
    const translated = this.i18nService.translate(message, lang, args);
    if (translated !== message) {
      return translated;
    }

    // Return original message if no translation found
    return message;
  }

  private getErrorName(status: number): string {
    const errorNames: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };
    return errorNames[status] || 'Error';
  }
}
