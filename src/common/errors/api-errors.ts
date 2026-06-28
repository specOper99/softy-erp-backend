import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

type ExceptionCtor = new (response: ApiErrorBody) => HttpException;

function body(code: string, args?: ApiErrorArgsRecord): ApiErrorBody {
  return args ? { [API_ERROR_CODE]: code, [API_ERROR_ARGS]: args } : { [API_ERROR_CODE]: code };
}

/** Structured API errors — message resolved in AllExceptionsFilter. */
export class ApiErrors {
  private static ex(ctor: ExceptionCtor, code: string, args?: ApiErrorArgsRecord): HttpException {
    return new ctor(body(code, args));
  }

  static badRequest(code: string, args?: ApiErrorArgsRecord): HttpException {
    return ApiErrors.ex(BadRequestException, code, args);
  }

  static unauthorized(code: string, args?: ApiErrorArgsRecord): HttpException {
    return ApiErrors.ex(UnauthorizedException, code, args);
  }

  static forbidden(code: string, args?: ApiErrorArgsRecord): HttpException {
    return ApiErrors.ex(ForbiddenException, code, args);
  }

  static notFound(code: string, args?: ApiErrorArgsRecord): HttpException {
    return ApiErrors.ex(NotFoundException, code, args);
  }

  static conflict(code: string, args?: ApiErrorArgsRecord): HttpException {
    return ApiErrors.ex(ConflictException, code, args);
  }

  static unprocessable(code: string, args?: ApiErrorArgsRecord): UnprocessableEntityException {
    return ApiErrors.ex(UnprocessableEntityException, code, args) as UnprocessableEntityException;
  }

  static internal(code: string, args?: ApiErrorArgsRecord): InternalServerErrorException {
    return ApiErrors.ex(InternalServerErrorException, code, args) as InternalServerErrorException;
  }

  static validation(items: ApiValidationErrorItem[]): BadRequestException {
    return new BadRequestException({
      [API_ERROR_CODE]: 'validation.failed',
      [API_VALIDATION_ERRORS]: items,
    });
  }
}
