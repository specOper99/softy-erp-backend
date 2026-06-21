import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly bucketName: string;
  private readonly s3Client: S3Client;

  constructor(
    configService: ConfigService,
    @Inject('CIRCUIT_BREAKER_S3')
    private readonly circuitBreaker: { fire: <T>(fn: () => Promise<T>) => Promise<T> },
  ) {
    this.bucketName = configService.get<string>('S3_BUCKET') || 'softy-media';

    const endpoint = configService.get<string>('S3_ENDPOINT');
    const region = configService.get<string>('S3_REGION') || 'us-east-1';

    this.s3Client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: configService.get<string>('S3_ACCESS_KEY') || '',
        secretAccessKey: configService.get<string>('S3_SECRET_KEY') || '',
      },
    });
  }

  async uploadFile(content: Buffer | string, key: string, contentType: string): Promise<{ key: string; url: string }> {
    await this.circuitBreaker.fire(() =>
      this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: content,
          ContentType: contentType,
        }),
      ),
    );

    return { key, url: await this.getPresignedDownloadUrl(key) };
  }

  async getPresignedDownloadUrl(key: string): Promise<string> {
    if (!key) {
      return '';
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.circuitBreaker.fire(() => getSignedUrl(this.s3Client, command, { expiresIn: 3600 }));
  }

  async deleteFile(key: string): Promise<void> {
    if (!key) {
      return;
    }

    await this.circuitBreaker.fire(() =>
      this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      ),
    );
  }
}
