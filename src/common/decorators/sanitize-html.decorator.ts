import { Transform, TransformFnParams } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export interface SanitizeHtmlOptions {
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
}

export function SanitizeHtml(options?: SanitizeHtmlOptions): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') {
      return value;
    }

    return sanitizeHtml(value, {
      allowedTags: options?.allowedTags || sanitizeHtml.defaults.allowedTags,
      allowedAttributes: options?.allowedAttributes || sanitizeHtml.defaults.allowedAttributes,
      disallowedTagsMode: 'discard',
    });
  });
}
