import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { sanitizeFormat } from './log-sanitizer';
import { getRequestContext } from './request-context';

// Custom format that adds correlation ID to every log
const correlationFormat = winston.format((info) => {
    const context = getRequestContext();
    if (context) {
        info.correlationId = context.correlationId;
        if (context.userId) {
            info.userId = context.userId;
        }
    }
    return info;
});

@Global()
@Module({
    imports: [
        WinstonModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const isProduction = configService.get('NODE_ENV') === 'production';

                return {
                    level: isProduction ? 'info' : 'debug',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        correlationFormat(),
                        sanitizeFormat() as any,
                        isProduction
                            ? winston.format.json()
                            : winston.format.combine(
                                winston.format.colorize(),
                                winston.format.printf(({ level, message, timestamp, correlationId, context, ...meta }) => {
                                    const corrId = correlationId ? `[${String(correlationId).substring(0, 8)}]` : '';
                                    const ctx = context ? `[${context}]` : '';
                                    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                                    return `${timestamp} ${level} ${corrId}${ctx} ${message} ${metaStr}`;
                                }),
                            ),
                    ),
                    transports: [
                        new winston.transports.Console(),
                        // Add file transport for production
                        ...(isProduction
                            ? [
                                new winston.transports.File({
                                    filename: 'logs/error.log',
                                    level: 'error',
                                }),
                                new winston.transports.File({
                                    filename: 'logs/combined.log',
                                }),
                            ]
                            : []),
                    ],
                };
            },
        }),
    ],
    exports: [WinstonModule],
})
export class LoggerModule { }
