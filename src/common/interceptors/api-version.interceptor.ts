import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
};

@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  private readonly currentVersion = '1.0.0';
  private readonly minVersion = '1.0.0';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('X-API-Version', this.currentVersion);
    response.setHeader('X-API-Min-Version', this.minVersion);

    const request = context.switchToHttp().getRequest<Request>();
    const matchedDeprecation = this.getDeprecatedRoutes().find((d) => request.url.startsWith(d.path));

    if (matchedDeprecation) {
      response.setHeader('Deprecation', matchedDeprecation.sunsetDate);
      response.setHeader('Sunset', new Date(matchedDeprecation.sunsetDate).toUTCString());
      response.setHeader('Link', matchedDeprecation.replacement);
    }

    return next.handle().pipe(
      map((data: unknown) => {
        if (!isPlainObject(data)) return data;
        return {
          ...data,
          _meta: {
            apiVersion: this.currentVersion,
            ...(matchedDeprecation && {
              deprecated: true,
              sunsetDate: matchedDeprecation.sunsetDate,
              replacement: matchedDeprecation.replacement,
            }),
          },
        };
      }),
    );
  }

  private getDeprecatedRoutes(): Array<{ path: string; sunsetDate: string; replacement: string }> {
    return [];
  }
}
