import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface TransformResponse<T> {
  data: T;
  statusCode: number;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, TransformResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<TransformResponse<T> | T> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data: T) => {
        // 204 No Content responses must not be wrapped — wrapping would send an
        // unexpected body and violate the "no content" contract.
        if (response.statusCode === 204) {
          return data;
        }
        return {
          data,
          statusCode: response.statusCode,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
