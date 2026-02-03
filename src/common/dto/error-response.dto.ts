import { HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Unified error response schema for all API endpoints
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
    enum: [
      HttpStatus.BAD_REQUEST,
      HttpStatus.UNAUTHORIZED,
      HttpStatus.FORBIDDEN,
      HttpStatus.NOT_FOUND,
      HttpStatus.CONFLICT,
      HttpStatus.UNPROCESSABLE_ENTITY,
      HttpStatus.INTERNAL_SERVER_ERROR,
      HttpStatus.TOO_MANY_REQUESTS,
    ],
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message or array of validation errors',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
  })
  message: string | string[];

  @ApiPropertyOptional({
    description: 'Error type/code for client-side handling',
    example: 'VALIDATION_ERROR',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'API path where the error occurred',
    example: '/api/v1/bookings',
  })
  path?: string;

  @ApiPropertyOptional({
    description: 'ISO timestamp of when the error occurred',
    example: '2026-02-03T10:30:00.000Z',
  })
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Request ID for tracing (if available)',
    example: 'req_123abc',
  })
  requestId?: string;

  @ApiPropertyOptional({
    description: 'Additional error details (validation errors, etc.)',
  })
  details?: Record<string, unknown>;
}

/**
 * Common error response examples for Swagger documentation
 */
export const ERROR_RESPONSES = {
  BAD_REQUEST: {
    status: 400,
    description: 'Bad Request - Validation failed',
    type: ErrorResponseDto,
    example: {
      statusCode: 400,
      message: ['name must be a string', 'price must be a positive number'],
      error: 'Bad Request',
      path: '/api/v1/packages',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  UNAUTHORIZED: {
    status: 401,
    description: 'Unauthorized - Authentication required',
    type: ErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Unauthorized',
      error: 'Unauthorized',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  FORBIDDEN: {
    status: 403,
    description: 'Forbidden - Insufficient permissions',
    type: ErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Forbidden resource',
      error: 'Forbidden',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  NOT_FOUND: {
    status: 404,
    description: 'Not Found - Resource does not exist',
    type: ErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Task with ID abc-123 not found',
      error: 'Not Found',
      path: '/api/v1/tasks/abc-123',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  CONFLICT: {
    status: 409,
    description: 'Conflict - Resource already exists',
    type: ErrorResponseDto,
    example: {
      statusCode: 409,
      message: 'Profile already exists for user',
      error: 'Conflict',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  UNPROCESSABLE_ENTITY: {
    status: 422,
    description: 'Unprocessable Entity - Business logic validation failed',
    type: ErrorResponseDto,
    example: {
      statusCode: 422,
      message: 'Cannot cancel booking less than 24 hours before event',
      error: 'Unprocessable Entity',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
    type: ErrorResponseDto,
    example: {
      statusCode: 429,
      message: 'Too many requests',
      error: 'Too Many Requests',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    description: 'Internal Server Error',
    type: ErrorResponseDto,
    example: {
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: '2026-02-03T10:30:00.000Z',
    },
  },
};
