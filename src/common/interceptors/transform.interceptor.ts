import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface TransformResponse<T> {
    data: T;
    statusCode: number;
    timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
    implements NestInterceptor<T, TransformResponse<T>> {
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<TransformResponse<T>> {
        const response = context.switchToHttp().getResponse();
        return next.handle().pipe(
            map((data) => ({
                data,
                statusCode: response.statusCode,
                timestamp: new Date().toISOString(),
            })),
        );
    }
}
