import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Inject, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response, Request } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { translateApiErrorMessage } from '../i18n/api-error-translation';
import { resolveLanguageFromHeader } from '../i18n/resolve-language.util';
import { getCorrelationId } from '../logger/request-context';

interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TypeOrmExceptionFilter.name);

  constructor(
    @Inject(I18nService)
    private readonly i18nService: I18nService,
  ) {}

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelationId>();

    const i18nLang = I18nContext.current(host)?.lang;
    const lang = i18nLang ?? resolveLanguageFromHeader(request.headers['accept-language'] as string | undefined);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let i18nKey = 'common.internal_error';
    let code = 'database.error';

    const dbCode = (exception as QueryFailedError & { code?: string }).code;

    // Postgres unique constraint violation
    if (dbCode === '23505') {
      status = HttpStatus.CONFLICT;
      i18nKey = 'common.resource_exists'; // assuming this exists, fallback to plain text if not
      code = 'database.conflict';
    }
    // Postgres foreign key violation
    else if (dbCode === '23503') {
      status = HttpStatus.BAD_REQUEST;
      i18nKey = 'common.invalid_reference';
      code = 'database.foreign_key_violation';
    }
    // Postgres not null violation
    else if (dbCode === '23502') {
      status = HttpStatus.BAD_REQUEST;
      i18nKey = 'common.missing_field';
      code = 'database.not_null_violation';
    }

    const message = translateApiErrorMessage(this.i18nService, i18nKey, undefined, lang, this.logger);

    const correlationId =
      (request.headers['x-correlation-id'] as string) || request.correlationId || getCorrelationId() || 'unknown';

    // If it's still 500, log as error. If it's a known constraint, log as warn or debug.
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        message: 'Unhandled Database Error',
        error: exception.message,
        dbCode,
        path: request.url,
        method: request.method,
        correlationId,
      });
    } else {
      this.logger.warn({
        message: 'Database Constraint Violation',
        error: exception.message,
        dbCode,
        path: request.url,
        method: request.method,
        correlationId,
      });
    }

    response.status(status).json({
      statusCode: status,
      message: message !== i18nKey ? message : this.getFallbackMessage(dbCode || ''),
      code,
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  }

  private getFallbackMessage(dbCode: string): string {
    switch (dbCode) {
      case '23505':
        return 'Resource already exists.';
      case '23503':
        return 'Related resource not found or invalid reference.';
      case '23502':
        return 'Missing required field.';
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }
}
