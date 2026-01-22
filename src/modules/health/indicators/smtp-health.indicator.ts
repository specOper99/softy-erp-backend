import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import * as net from 'net';

@Injectable()
export class SmtpHealthIndicator extends HealthIndicator {
  private host: string;
  private port: number;

  constructor(private readonly configService: ConfigService) {
    super();
    this.host = this.configService.get<string>('SMTP_HOST') || 'localhost';
    this.port = this.configService.get<number>('SMTP_PORT') || 587;
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const socket = new net.Socket();
    const timeout = 5000;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeout);

      socket.once('connect', () => {
        cleanup();
        resolve(this.getStatus(key, true, { host: this.host, port: this.port }));
      });

      socket.once('timeout', () => {
        cleanup();
        reject(
          new HealthCheckError(`${key} check failed`, this.getStatus(key, false, { message: 'Connection timeout' })),
        );
      });

      socket.once('error', (error) => {
        cleanup();
        reject(new HealthCheckError(`${key} check failed`, this.getStatus(key, false, { message: error.message })));
      });

      try {
        socket.connect(this.port, this.host);
      } catch (error) {
        cleanup();
        reject(
          new HealthCheckError(
            `${key} check failed`,
            this.getStatus(key, false, {
              message: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
      }
    });
  }
}
