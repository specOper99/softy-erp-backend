import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import * as CircuitBreaker from 'opossum';

export interface UploadedFile {
  key: string;
  url: string;
  bucket: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client!: S3Client;
  private bucket!: string;
  private endpoint!: string;
  private publicUrl!: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('CIRCUIT_BREAKER_S3')
    private readonly breaker: CircuitBreaker,
  ) {}

  // Security: MIME type whitelist to prevent malicious file uploads
  public static readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  onModuleInit() {
    this.endpoint = this.configService.get('MINIO_ENDPOINT', 'http://localhost:9000');
    this.bucket = this.configService.get('MINIO_BUCKET', 'chapters-studio');
    this.publicUrl = this.configService.get('MINIO_PUBLIC_URL', this.endpoint);

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: this.configService.get('MINIO_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('MINIO_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('MINIO_SECRET_KEY'),
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.logger.log(`Storage service initialized with endpoint: ${this.endpoint}`);
  }

  /**
   * Upload a file to MinIO
   */
  async uploadFile(buffer: Buffer, key: string, mimeType: string): Promise<UploadedFile> {
    // Security: Validate MIME type against whitelist
    if (!StorageService.ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}. Allowed types: ${[...StorageService.ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.breaker.fire(() => this.s3Client.send(command));

    return {
      key,
      bucket: this.bucket,
      url: `${this.publicUrl}/${this.bucket}/${key}`,
    };
  }

  /**
   * Generate a unique key for uploaded files
   */
  async generateKey(originalName: string, prefix = 'uploads'): Promise<string> {
    const timestamp = Date.now();

    // Use callback-based randomBytes with promisify to be non-blocking
    const randomBytesAsync = promisify(randomBytes);

    const buffer = await randomBytesAsync(16);
    const randomPart = buffer.toString('hex');
    const ext = originalName.split('.').pop() || '';
    const sanitizedName = originalName
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replaceAll(/[^a-zA-Z0-9-_]/g, '_') // Sanitize
      .substring(0, 50); // Limit length

    return `${prefix}/${timestamp}-${randomPart}-${sanitizedName}.${ext}`;
  }

  /**
   * Delete a file from MinIO
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.breaker.fire(() => this.s3Client.send(command));
    this.logger.log(`Deleted file: ${key}`);
  }

  /**
   * Get a file stream from MinIO
   */
  /**
   * Type guard to ensure S3 response is valid
   */
  private isGetObjectOutput(output: unknown): output is GetObjectCommandOutput {
    return (
      typeof output === 'object' &&
      output !== null &&
      'Body' in output &&
      (output as GetObjectCommandOutput).Body instanceof Readable
    );
  }

  /**
   * Get a file stream from MinIO
   */
  async getFileStream(key: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.breaker.fire(() => this.s3Client.send(command));

    if (!this.isGetObjectOutput(response)) {
      throw new InternalServerErrorException('media.s3_error');
    }

    if (response.Body instanceof Readable) {
      return response.Body;
    }
    throw new InternalServerErrorException('media.s3_error');
  }

  /**
   * Generate a pre-signed URL for direct upload
   */
  async getPresignedUploadUrl(key: string, mimeType: string, expiresIn = 3600): Promise<string> {
    // Security: Validate MIME type against whitelist
    if (!StorageService.ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}. Allowed types: ${[...StorageService.ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Generate a pre-signed URL for direct download
   */
  async getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Extract storage key from URL
   */
  extractKeyFromUrl(url: string): string | null {
    if (!url) {
      return null;
    }

    // If we stored the raw key (e.g. "uploads/..."), just return it.
    if (!/^https?:\/\//i.test(url)) {
      return url;
    }

    const match = new RegExp(`${this.bucket}/(.+)$`).exec(url);
    return match?.[1] ?? null;
  }
}
