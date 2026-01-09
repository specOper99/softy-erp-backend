import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Packr } from 'msgpackr';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class MessagePackInterceptor implements NestInterceptor {
  private readonly packr = new Packr();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    // Check if the client accepts MessagePack
    const acceptHeader = request.headers.accept;
    const wantsMessagePack =
      acceptHeader && acceptHeader.includes('application/x-msgpack');

    if (!wantsMessagePack) {
      // Pass through if MessagePack is not requested
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        // If the data is already a StreamableFile, let Nest handle it (it might be a file download)
        if (data instanceof StreamableFile) {
          return data;
        }

        // Set the Content-Type header
        response.setHeader('Content-Type', 'application/x-msgpack');

        // Serialize data to MessagePack buffer and wrap in StreamableFile
        // to bypass NestJS JSON serialization and other interceptors
        try {
          return new StreamableFile(Buffer.from(this.packr.pack(data)));
        } catch {
          throw new InternalServerErrorException('common.serialization_error');
        }
      }),
    );
  }
}
