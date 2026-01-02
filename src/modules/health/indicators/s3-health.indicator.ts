import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';

@Injectable()
export class S3HealthIndicator extends HealthIndicator {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.bucketName =
      this.configService.get<string>('S3_BUCKET') || 'chapters-media';

    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const region = this.configService.get<string>('S3_REGION') || 'us-east-1';

    this.s3Client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true, // Required for MinIO
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY') || '',
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY') || '',
      },
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
      return this.getStatus(key, true, { bucket: this.bucketName });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'S3 connection failed';
      throw new HealthCheckError(
        `${key} check failed`,
        this.getStatus(key, false, { message }),
      );
    }
  }
}
