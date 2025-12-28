import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import * as net from 'net';

@Injectable()
export class SmtpHealthIndicator extends HealthIndicator {
  private host: string;
  private port: number;

  constructor(private configService: ConfigService) {
    super();
    this.host = this.configService.get<string>('SMTP_HOST') || 'localhost';
    this.port = this.configService.get<number>('SMTP_PORT') || 587;
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = 5000; // 5 second timeout

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        socket.destroy();
        resolve(
          this.getStatus(key, true, { host: this.host, port: this.port }),
        );
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(
          new HealthCheckError(
            `${key} check failed`,
            this.getStatus(key, false, { message: 'Connection timeout' }),
          ),
        );
      });

      socket.on('error', (error) => {
        socket.destroy();
        reject(
          new HealthCheckError(
            `${key} check failed`,
            this.getStatus(key, false, { message: error.message }),
          ),
        );
      });

      socket.connect(this.port, this.host);
    });
  }
}
