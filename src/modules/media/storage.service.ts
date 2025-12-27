import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

export interface UploadedFile {
    key: string;
    url: string;
    bucket: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
    private readonly logger = new Logger(StorageService.name);
    private s3Client: S3Client;
    private bucket: string;
    private endpoint: string;
    private publicUrl: string;

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        this.endpoint = this.configService.get('MINIO_ENDPOINT', 'http://localhost:9000');
        this.bucket = this.configService.get('MINIO_BUCKET', 'chapters-studio');
        this.publicUrl = this.configService.get('MINIO_PUBLIC_URL', this.endpoint);

        this.s3Client = new S3Client({
            endpoint: this.endpoint,
            region: this.configService.get('MINIO_REGION', 'us-east-1'),
            credentials: {
                accessKeyId: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
                secretAccessKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
            },
            forcePathStyle: true, // Required for MinIO
        });

        this.logger.log(`Storage service initialized with endpoint: ${this.endpoint}`);
    }

    /**
     * Upload a file to MinIO
     */
    async uploadFile(
        buffer: Buffer,
        key: string,
        mimeType: string,
    ): Promise<UploadedFile> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        });

        await this.s3Client.send(command);

        return {
            key,
            bucket: this.bucket,
            url: `${this.publicUrl}/${this.bucket}/${key}`,
        };
    }

    /**
     * Generate a unique key for uploaded files
     */
    generateKey(originalName: string, prefix = 'uploads'): string {
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substring(2, 10);
        const ext = originalName.split('.').pop() || '';
        const sanitizedName = originalName
            .replace(/\.[^/.]+$/, '') // Remove extension
            .replace(/[^a-zA-Z0-9-_]/g, '_') // Sanitize
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

        await this.s3Client.send(command);
        this.logger.log(`Deleted file: ${key}`);
    }

    /**
     * Get a file stream from MinIO
     */
    async getFileStream(key: string): Promise<Readable> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        const response = await this.s3Client.send(command);
        return response.Body as Readable;
    }

    /**
     * Generate a pre-signed URL for direct upload
     */
    async getPresignedUploadUrl(key: string, mimeType: string, expiresIn = 3600): Promise<string> {
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
        const match = url.match(new RegExp(`${this.bucket}/(.+)$`));
        return match ? match[1] : null;
    }
}
