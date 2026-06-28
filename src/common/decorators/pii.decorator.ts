import 'reflect-metadata';

export { PII_FIELD_PATTERNS } from '../constants/sensitive-log-keys';

export const PII_METADATA_KEY = 'pii_field';

/** Marks PII fields for runtime log masking via LogSanitizer. */
export function PII(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existingPiiFields =
      (Reflect.getMetadata(PII_METADATA_KEY, target.constructor) as (string | symbol)[] | undefined) || [];
    if (!existingPiiFields.includes(propertyKey)) {
      Reflect.defineMetadata(PII_METADATA_KEY, [...existingPiiFields, propertyKey], target.constructor);
    }
  };
}

export function getPiiFields(target: new (...args: unknown[]) => unknown): (string | symbol)[] {
  return (Reflect.getMetadata(PII_METADATA_KEY, target) as (string | symbol)[] | undefined) || [];
}
