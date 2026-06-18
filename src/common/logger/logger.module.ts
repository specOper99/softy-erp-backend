/**
 * T-105 (nestjs-pino migration) — DEFERRED. Full migration touches logger.module,
 * main.ts, correlation-id.middleware, request-context (18 callers), and
 * log-sanitizer. See HANDOFF_PLAN.md T-105.
 *
 * Coolify logging strategy (current): Winston Console transport emits JSON to
 * stdout in production — Coolify captures container logs. Optional LOKI_HOST
 * pushes to Grafana Loki. File transports write to /app/logs (volume-mounted).
 * After Pino cutover: stdout JSON only; coordinate Grafana query field renames.
 */
/**
 * T-105 (HANDOFF_PLAN): Migrate Winston → nestjs-pino.
 * - Prod: JSON to stdout only (Coolify log viewer; drop file transports).
 * - Keep correlationId / userId fields stable for Loki/Grafana queries.
 * - Enable Loki via LOKI_HOST when optional Loki stack is deployed (see RUNBOOK.md).
 */
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';
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
            sanitizeFormat(),
            isProduction
              ? winston.format.json()
              : winston.format.combine(
                  winston.format.colorize(),
                  winston.format.printf(
                    ({
                      level,
                      message,
                      timestamp,
                      correlationId,
                      context,
                      ...meta
                    }: winston.Logform.TransformableInfo) => {
                      const corrId = correlationId
                        ? `[${typeof correlationId === 'string' ? correlationId.substring(0, 8) : JSON.stringify(correlationId).substring(0, 8)}]`
                        : '';
                      const ctx = context ? `[${typeof context === 'string' ? context : JSON.stringify(context)}]` : '';
                      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                      return `${String(timestamp)} ${String(level)} ${corrId}${ctx} ${String(message)} ${metaStr}`;
                    },
                  ),
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
            // Add Loki transport if LOKI_HOST is configured
            ...(configService.get('LOKI_HOST')
              ? [
                  new LokiTransport({
                    host: configService.get<string>('LOKI_HOST') as string,
                    labels: {
                      app: 'softy-erp',
                      environment: configService.get<string>('NODE_ENV') ?? 'development',
                    },
                    json: true,
                    batching: true,
                    interval: 5,
                    replaceTimestamp: true,
                    onConnectionError: (err: Error) => {
                      process.stderr.write(`[LoggerModule] Loki connection error: ${err.message}\n`);
                    },
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
export class LoggerModule {}
