import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Global cache interceptor placeholder.
 * Currently passes through without caching logic.
 * Can be extended later to integrate Redis caching.
 */
@Injectable()
export class GlobalCacheInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> {
    // Directly forward the request handling.
    return next.handle();
  }
}
