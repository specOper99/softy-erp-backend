import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { StorageService } from '../../../src/modules/media/storage.service';

describe('MinIO Storage Integration Tests', () => {
  let module: TestingModule;
  let storageService: StorageService;
  let minioContainer: StartedTestContainer;
  let s3Client: S3Client;
  let minioEndpoint: string;

  const BUCKET_NAME = 'test-bucket';
  const ACCESS_KEY = 'minioadmin';
  const SECRET_KEY = 'minioadmin';

  beforeAll(async () => {
    // Start MinIO container
    console.log('🐳 Starting MinIO container...');
    minioContainer = await new GenericContainer('minio/minio')
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER: ACCESS_KEY,
        MINIO_ROOT_PASSWORD: SECRET_KEY,
      })
      .start();

    const host = minioContainer.getHost();
    const port = minioContainer.getMappedPort(9000);
    minioEndpoint = `http://${host}:${port}`;

    console.log(`✅ MinIO container started at ${minioEndpoint}`);

    // Create S3 client
    s3Client = new S3Client({
      endpoint: minioEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
      },
      forcePathStyle: true,
    });

    // Create test module
    module = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                MINIO_ENDPOINT: minioEndpoint,
                MINIO_BUCKET: BUCKET_NAME,
                MINIO_REGION: 'us-east-1',
                MINIO_ACCESS_KEY: ACCESS_KEY,
                MINIO_SECRET_KEY: SECRET_KEY,
                MINIO_PUBLIC_URL: minioEndpoint,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    storageService = module.get<StorageService>(StorageService);
  });

  afterAll(async () => {
    await module?.close();
    if (minioContainer) {
      await minioContainer.stop();
      console.log('✅ MinIO container stopped');
    }
  });

  describe('File Upload Operations', () => {
    it('should upload a file successfully', async () => {
      const fileName = 'test-upload.txt';
      const fileContent = Buffer.from('Hello MinIO!', 'utf-8');
      const tenantId = 'tenant-123';

      const result = await storageService.uploadFile(
        fileContent,
        fileName,
        'text/plain',
        tenantId,
      );

      expect(result).toBeDefined();
      expect(result.key).toContain(tenantId);
      expect(result.key).toContain(fileName);
      expect(result.url).toContain(minioEndpoint);
    });

    it('should upload image files', async () => {
      const fileName = 'test-image.jpg';
      // Create a minimal valid JPEG buffer
      const fileContent = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      ]);
      const tenantId = 'tenant-456';

      const result = await storageService.uploadFile(
        fileContent,
        fileName,
        'image/jpeg',
        tenantId,
      );

      expect(result).toBeDefined();
      expect(result.key).toContain('test-image.jpg');
      expect(result.contentType).toBe('image/jpeg');
    });

    it('should handle tenant isolation in file keys', async () => {
      const fileName = 'isolated-file.txt';
      const content = Buffer.from('Tenant data', 'utf-8');

      const tenant1Result = await storageService.uploadFile(
        content,
        fileName,
        'text/plain',
        'tenant-111',
      );

      const tenant2Result = await storageService.uploadFile(
        content,
        fileName,
        'text/plain',
        'tenant-222',
      );

      expect(tenant1Result.key).toContain('tenant-111');
      expect(tenant2Result.key).toContain('tenant-222');
      expect(tenant1Result.key).not.toBe(tenant2Result.key);
    });
  });

  describe('File Download Operations', () => {
    it('should generate presigned URLs for downloads', async () => {
      // First upload a file
      const fileName = 'download-test.txt';
      const content = Buffer.from('Download me!', 'utf-8');
      const tenantId = 'tenant-download';

      const uploadResult = await storageService.uploadFile(
        content,
        fileName,
        'text/plain',
        tenantId,
      );

      // Generate presigned URL
      const url = await storageService.getPresignedUrl(uploadResult.key);

      expect(url).toBeDefined();
      expect(url).toContain(minioEndpoint);
      expect(url).toContain(uploadResult.key);
    });

    it('should retrieve uploaded file content', async () => {
      const fileName = 'retrieve-test.txt';
      const originalContent = 'Original content here';
      const buffer = Buffer.from(originalContent, 'utf-8');
      const tenantId = 'tenant-retrieve';

      // Upload
      const uploadResult = await storageService.uploadFile(
        buffer,
        fileName,
        'text/plain',
        tenantId,
      );

      // Retrieve
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: uploadResult.key,
      });

      const response = await s3Client.send(command);
      const retrievedContent = await response.Body?.transformToString();

      expect(retrievedContent).toBe(originalContent);
    });
  });

  describe('File Deletion Operations', () => {
    it('should delete files successfully', async () => {
      const fileName = 'delete-test.txt';
      const content = Buffer.from('To be deleted', 'utf-8');
      const tenantId = 'tenant-delete';

      // Upload
      const uploadResult = await storageService.uploadFile(
        content,
        fileName,
        'text/plain',
        tenantId,
      );

      // Delete
      await storageService.deleteFile(uploadResult.key);

      // Verify deletion
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: uploadResult.key,
      });

      await expect(s3Client.send(getCommand)).rejects.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent uploads', async () => {
      const tenantId = 'tenant-concurrent';
      const uploads = [];

      for (let i = 0; i < 10; i++) {
        const content = Buffer.from(`File ${i}`, 'utf-8');
        uploads.push(
          storageService.uploadFile(
            content,
            `concurrent-${i}.txt`,
            'text/plain',
            tenantId,
          ),
        );
      }

      const results = await Promise.all(uploads);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.key).toContain(`concurrent-${index}.txt`);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid file keys gracefully', async () => {
      await expect(
        storageService.deleteFile('non-existent-key-123'),
      ).resolves.not.toThrow();
    });

    it('should validate file uploads', async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(
        storageService.uploadFile(
          emptyBuffer,
          'empty.txt',
          'text/plain',
          'tenant-test',
        ),
      ).rejects.toThrow();
    });
  });
});
