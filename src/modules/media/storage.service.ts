import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  constructor(
    _configService: ConfigService,
    @Inject('CIRCUIT_BREAKER_S3')
    _circuitBreaker: { fire: <T>(fn: () => T) => T },
  ) {}

  async uploadFile(
    _content: Buffer | string,
    _key: string,
    _contentType: string,
  ): Promise<{ key: string; url: string }> {
    return { key: _key, url: '' };
  }

  async getPresignedDownloadUrl(_key: string): Promise<string> {
    return '';
  }

  async deleteFile(_key: string): Promise<void> {}
}
