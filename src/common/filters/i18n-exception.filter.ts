import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nService, Language } from '../i18n';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
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
    const exceptionResponse = exception.getResponse();
    const originalMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: string }).message || 'Error';

    // Try to translate the message
    const translatedMessage = this.translateMessage(originalMessage, lang);

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: translatedMessage,
      error: this.getErrorName(status),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  private translateMessage(message: string, lang: Language): string {
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
      return this.i18nService.translate(translationKey, lang);
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
