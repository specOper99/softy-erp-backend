import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe as BaseValidationPipe,
  Injectable,
  Type,
  ValidationError,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { I18nService } from 'nestjs-i18n';

/**
 * Custom ValidationPipe that integrates with I18nService to translate
 * class-validator error messages to i18n keys.
 *
 * Note: The global ValidationPipe in main.ts already handles validation with
 * i18n error mapping via exceptionFactory. This pipe is kept for backward compatibility
 * but is not actively used in the application.
 *
 * Maps class-validator constraint names to translation keys:
 * - isNotEmpty → validation.required
 * - isEmail → validation.invalid_email
 * - minLength → validation.min_length
 * - maxLength → validation.max_length
 * - isString → validation.must_be_string
 * - isNumber → validation.must_be_number
 * - isBoolean → validation.must_be_boolean
 * - isDefined → validation.required
 * - isEnum → validation.invalid_choice
 * - isDate → validation.must_be_date
 * - matches → validation.invalid_format
 * - min → validation.min_value
 * - max → validation.max_value
 */
@Injectable()
export class I18nValidationPipe extends BaseValidationPipe {
  constructor(private readonly i18nService: I18nService) {
    super({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });
  }

  async transform(value: unknown, metadata: ArgumentMetadata) {
    // Get language from request context if available
    // Otherwise default to English
    const i18nMeta = metadata as ArgumentMetadata & { args?: Array<{ i18nLang?: string } | undefined> };
    const lang: string = i18nMeta.args?.[2]?.i18nLang ?? 'en';

    const metatype =
      metadata.type === 'body' || metadata.type === 'query' || metadata.type === 'param' ? metadata.metatype : null;

    if (!metatype || !this.shouldValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object as object);

    if (errors.length > 0) {
      const translatedErrors = this.translateErrors(errors, lang);
      throw new BadRequestException({
        message: 'Validation failed',
        statusCode: 400,
        errors: translatedErrors,
      });
    }

    return value;
  }

  /**
   * Determine if a metatype should be validated
   */
  private shouldValidate(metatype: Type<unknown>): boolean {
    const types = [String, Boolean, Number, Array, Object] as Array<Type<unknown>>;
    return !types.includes(metatype);
  }

  /**
   * Translate validation errors to i18n keys
   */
  private translateErrors(errors: ValidationError[], lang: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const error of errors) {
      if (error.constraints) {
        const messages: string[] = [];

        for (const [constraint] of Object.entries(error.constraints)) {
          const translationKey = this.constraintToTranslationKey(constraint);
          const translated = this.i18nService.translate(translationKey, {
            lang,
            args: {
              field: this.humanizeField(error.property),
              value: error.value,
            },
          });
          messages.push(translated as string);
        }

        result[error.property] = messages.join('; ');
      }

      // Handle nested errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.translateErrors(error.children, lang);
        for (const [key, value] of Object.entries(nestedErrors)) {
          result[`${error.property}.${key}`] = value;
        }
      }
    }

    return result;
  }

  /**
   * Map class-validator constraint names to i18n translation keys
   */
  private constraintToTranslationKey(constraint: string): string {
    const constraintMap: Record<string, string> = {
      isNotEmpty: 'validation.required',
      isDefined: 'validation.required',
      isEmpty: 'validation.must_be_empty',
      isEmail: 'validation.invalid_email',
      isPhoneNumber: 'validation.invalid_phone',
      isUrl: 'validation.invalid_url',
      minLength: 'validation.min_length',
      maxLength: 'validation.max_length',
      min: 'validation.min_value',
      max: 'validation.max_value',
      isString: 'validation.must_be_string',
      isNumber: 'validation.must_be_number',
      isInt: 'validation.must_be_integer',
      isBoolean: 'validation.must_be_boolean',
      isDate: 'validation.must_be_date',
      isEnum: 'validation.invalid_choice',
      matches: 'validation.invalid_format',
      isArray: 'validation.must_be_array',
      arrayMinSize: 'validation.min_array_size',
      arrayMaxSize: 'validation.max_array_size',
      isUUID: 'validation.invalid_uuid',
      isISBN: 'validation.invalid_isbn',
      isISSN: 'validation.invalid_issn',
      isMACAddress: 'validation.invalid_mac_address',
      isIP: 'validation.invalid_ip_address',
      isJSON: 'validation.invalid_json',
      isNumberString: 'validation.must_be_number_string',
      isLatitude: 'validation.invalid_latitude',
      isLongitude: 'validation.invalid_longitude',
    };

    return constraintMap[constraint] || 'validation.invalid';
  }

  /**
   * Convert camelCase field names to human-readable format
   * e.g., 'firstName' → 'First Name'
   */
  private humanizeField(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }
}
