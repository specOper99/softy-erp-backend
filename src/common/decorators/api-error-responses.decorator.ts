import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ERROR_RESPONSES, ErrorResponseDto } from '../dto/error-response.dto';

type ErrorResponseKey = keyof typeof ERROR_RESPONSES;

const RETRY_AFTER_HEADER = {
  'Retry-After': {
    description: 'Seconds to wait before retrying the request',
    schema: { type: 'string', example: '60' },
  },
};

export function ApiErrorResponses(...keys: ErrorResponseKey[]) {
  const decorators = keys.map((key) => {
    const response = ERROR_RESPONSES[key];
    const headers = key === 'TOO_MANY_REQUESTS' ? RETRY_AFTER_HEADER : undefined;

    return ApiResponse({
      status: response.status,
      description: response.description,
      headers,
      content: {
        'application/json': {
          schema: {
            $ref: getSchemaPath(ErrorResponseDto),
          },
          example: response.example,
        },
      },
    });
  });

  return applyDecorators(ApiExtraModels(ErrorResponseDto), ...decorators);
}
