import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  constructor(
    private readonly configService: ConfigService,
    @Inject('CIRCUIT_BREAKER_S3')
    private readonly circuitBreaker: { fire: <T>(fn: () => T) => T },
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
