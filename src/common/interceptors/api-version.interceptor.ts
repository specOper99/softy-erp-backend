import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';

/**
 * API versioning interceptor that adds version headers to all responses.
 * Supports deprecation warnings for legacy endpoints.
 */
@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  private readonly currentVersion = '1.0.0';
  private readonly minVersion = '1.0.0';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    // Add version headers to all responses
    response.setHeader('X-API-Version', this.currentVersion);
    response.setHeader('X-API-Min-Version', this.minVersion);

    // Check for deprecated endpoints (can be enhanced per-route)
    const request = context.switchToHttp().getRequest<Request>();
    const deprecatedRoutes = this.getDeprecatedRoutes();
    const matchedDeprecation = deprecatedRoutes.find((d) =>
      request.url.startsWith(d.path),
    );

    if (matchedDeprecation) {
      response.setHeader('Deprecation', matchedDeprecation.sunsetDate);
      response.setHeader(
        'Sunset',
        new Date(matchedDeprecation.sunsetDate).toUTCString(),
      );
      response.setHeader('Link', matchedDeprecation.replacement);
    }

    return next.handle().pipe(
      map((data: unknown) => {
        // Optionally inject version info into responses
        if (
          data &&
          typeof data === 'object' &&
          !Array.isArray(data) &&
          !(data instanceof Buffer) &&
          !(data instanceof StreamableFile)
        ) {
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
        }
        return data;
      }),
    );
  }

  /**
   * Define deprecated routes with sunset dates and replacements.
   * Add entries here as you deprecate old API endpoints.
   */
  private getDeprecatedRoutes(): Array<{
    path: string;
    sunsetDate: string;
    replacement: string;
  }> {
    // Example deprecated routes (empty for now)
    return [
      // {
      //   path: '/api/v1/legacy-endpoint',
      //   sunsetDate: '2025-06-01',
      //   replacement: '</api/v2/new-endpoint>; rel="successor-version"',
      // },
    ];
  }
}
