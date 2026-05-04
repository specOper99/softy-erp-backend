import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  API_ERROR_ARGS,
  API_ERROR_CODE,
  API_VALIDATION_ERRORS,
  type ApiValidationErrorItem,
} from '../i18n/api-error-translation';

export type ApiErrorArgsRecord = Record<string, string | number | boolean>;

export interface ApiErrorBody {
  [API_ERROR_CODE]: string;
  [API_ERROR_ARGS]?: ApiErrorArgsRecord;
  [API_VALIDATION_ERRORS]?: ApiValidationErrorItem[];
}

function body(code: string, args?: ApiErrorArgsRecord): ApiErrorBody {
  return args ? { [API_ERROR_CODE]: code, [API_ERROR_ARGS]: args } : { [API_ERROR_CODE]: code };
}

/** Factory for consistent structured API errors (code + args only; message is resolved in AllExceptionsFilter). */
export class ApiErrors {
  static badRequest(code: string, args?: ApiErrorArgsRecord): HttpException {
    return new BadRequestException(body(code, args));
  }

  static unauthorized(code: string, args?: ApiErrorArgsRecord): HttpException {
    return new UnauthorizedException(body(code, args));
  }

  static forbidden(code: string, args?: ApiErrorArgsRecord): HttpException {
    return new ForbiddenException(body(code, args));
  }

  static notFound(code: string, args?: ApiErrorArgsRecord): HttpException {
    return new NotFoundException(body(code, args));
  }

  static conflict(code: string, args?: ApiErrorArgsRecord): HttpException {
    return new ConflictException(body(code, args));
  }

  static unprocessable(code: string, args?: ApiErrorArgsRecord): UnprocessableEntityException {
    return new UnprocessableEntityException(body(code, args));
  }

  static validation(items: ApiValidationErrorItem[]): BadRequestException {
    return new BadRequestException({
      [API_ERROR_CODE]: 'validation.failed',
      [API_VALIDATION_ERRORS]: items,
    });
  }

  static internal(code: string, args?: ApiErrorArgsRecord): InternalServerErrorException {
    return new InternalServerErrorException(body(code, args));
  }
}
