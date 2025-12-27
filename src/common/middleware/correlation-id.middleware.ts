import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncLocalStorage, RequestContext } from '../logger/request-context';

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        // Get correlation ID from header or generate new one
        const correlationId =
            (req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) || uuidv4();

        // Set correlation ID in response header
        res.setHeader(CORRELATION_ID_HEADER, correlationId);

        // Create request context
        const context: RequestContext = {
            correlationId,
            method: req.method,
            path: req.originalUrl,
            ip: req.ip || req.socket?.remoteAddress,
        };

        // Run the rest of the request in the async local storage context
        asyncLocalStorage.run(context, () => {
            next();
        });
    }
}
