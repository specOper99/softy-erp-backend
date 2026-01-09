import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Shared service for extracting request context information.
 * Centralizes IP extraction logic with proper TRUST_PROXY handling.
 */
@Injectable()
export class RequestContextService {
  private readonly trustProxyHeaders: boolean;

  constructor(private readonly configService: ConfigService) {
    this.trustProxyHeaders =
      this.configService.get<string>('TRUST_PROXY') === 'true';
  }

  /**
   * Extract client IP address from request.
   * Only trusts proxy headers (x-forwarded-for, x-real-ip) when TRUST_PROXY is enabled.
   */
  getClientIp(request: Request): string {
    if (this.trustProxyHeaders) {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
      const realIp = request.headers['x-real-ip'];
      if (typeof realIp === 'string') {
        return realIp;
      }
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  /**
   * Extract correlation ID from request headers.
   */
  getCorrelationId(request: Request): string | undefined {
    const correlationIdHeader = request.headers['x-correlation-id'];
    return Array.isArray(correlationIdHeader)
      ? correlationIdHeader[0]
      : correlationIdHeader;
  }

  /**
   * Extract user agent from request headers.
   */
  getUserAgent(request: Request): string | undefined {
    return request.headers['user-agent'];
  }
}
