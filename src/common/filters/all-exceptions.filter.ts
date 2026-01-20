import type { ArgumentsHost } from '@nestjs/common';
import { Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
  method: string;
}

interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelationId>();

    const isProduction = process.env.NODE_ENV === 'production';
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ||
      request.correlationId ||
      this.generateCorrelationId();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as {
          message?: string | string[];
          error?: string;
        };
        const msg = responseObj.message || exception.message;
        message = this.formatMessage(msg);
        void responseObj.error;
        void exception.name;
      } else {
        message = String(exceptionResponse);
        void exception.name;
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = isProduction ? 'An unexpected error occurred. Please try again later.' : exception.message;

      this.logger.error({
        message: 'Unhandled exception',
        correlationId,
        error: exception.message,
        stack: exception.stack,
        path: request.url,
        method: request.method,
        ipAddress: request.ip,
      });
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = isProduction ? 'An unexpected error occurred. Please try again later.' : 'Unknown error occurred';

      this.logger.error({
        message: 'Unknown exception type',
        correlationId,
        path: request.url,
        method: request.method,
      });
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    response.status(status).json(errorResponse);
  }

  private formatMessage(msg: string | string[]): string {
    if (Array.isArray(msg)) {
      return msg.join(', ');
    }
    return String(msg);
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
