import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

    // Create bucket
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`✅ Bucket ${BUCKET_NAME} created`);
    } catch (err) {
      console.error('Error creating bucket:', err);
    }

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
            getOrThrow: jest.fn((key: string) => {
              const config: Record<string, string> = {
                MINIO_ENDPOINT: minioEndpoint,
                MINIO_BUCKET: BUCKET_NAME,
                MINIO_REGION: 'us-east-1',
                MINIO_ACCESS_KEY: ACCESS_KEY,
                MINIO_SECRET_KEY: SECRET_KEY,
                MINIO_PUBLIC_URL: minioEndpoint,
              };
              if (!config[key]) throw new Error(`Config key ${key} not found`);
              return config[key];
            }),
          },
        },
        {
          provide: 'CIRCUIT_BREAKER_S3',
          useValue: {
            fire: jest.fn((fn) => fn()),
          },
        },
      ],
    }).compile();

    storageService = module.get<StorageService>(StorageService);
    await module.init();
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
      const fileName = 'test-upload.pdf';
      const fileContent = Buffer.from('Hello MinIO!', 'utf-8');
      const tenantId = 'tenant-123';

      const result = await storageService.uploadFile(fileContent, `${tenantId}/${fileName}`, 'application/pdf');

      expect(result).toBeDefined();
      expect(result.key).toContain(tenantId);
      expect(result.key).toContain(fileName);
      expect(result.url).toContain(minioEndpoint);
    });

    it('should upload image files', async () => {
      const fileName = 'test-image.jpg';
      // Create a minimal valid JPEG buffer
      const fileContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const tenantId = 'tenant-456';

      const result = await storageService.uploadFile(fileContent, `${tenantId}/${fileName}`, 'image/jpeg');

      expect(result).toBeDefined();
      expect(result.key).toContain(fileName);
    });

    it('should handle tenant isolation in file keys', async () => {
      const fileName = 'isolated-file.pdf';
      const content = Buffer.from('Tenant data', 'utf-8');

      const tenant1Result = await storageService.uploadFile(content, 'tenant-111/' + fileName, 'application/pdf');

      const tenant2Result = await storageService.uploadFile(content, 'tenant-222/' + fileName, 'application/pdf');

      expect(tenant1Result.key).toContain('tenant-111');
      expect(tenant2Result.key).toContain('tenant-222');
      expect(tenant1Result.key).not.toBe(tenant2Result.key);
    });
  });

  describe('File Download Operations', () => {
    it('should generate presigned URLs for downloads', async () => {
      // First upload a file
      const fileName = 'download-test.pdf';
      const content = Buffer.from('Download me!', 'utf-8');
      const tenantId = 'tenant-download';

      const uploadResult = await storageService.uploadFile(content, `${tenantId}/${fileName}`, 'application/pdf');

      // Generate presigned URL
      const url = await storageService.getPresignedDownloadUrl(uploadResult.key);

      expect(url).toBeDefined();
      expect(url).toContain(minioEndpoint);
      expect(url).toContain(uploadResult.key);
    });

    it('should retrieve uploaded file content', async () => {
      const fileName = 'retrieve-test.pdf';
      const originalContent = 'Original content here';
      const buffer = Buffer.from(originalContent, 'utf-8');
      const tenantId = 'tenant-retrieve';

      // Upload

      const uploadResult = await storageService.uploadFile(buffer, `${tenantId}/${fileName}`, 'application/pdf');

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
      const fileName = 'delete-test.pdf';
      const content = Buffer.from('To be deleted', 'utf-8');
      const tenantId = 'tenant-delete';

      // Upload
      const uploadResult = await storageService.uploadFile(content, `${tenantId}/${fileName}`, 'application/pdf');

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
        uploads.push(storageService.uploadFile(content, `${tenantId}/concurrent-${i}.pdf`, 'application/pdf'));
      }

      const results = await Promise.all(uploads);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.key).toContain(`concurrent-${index}.pdf`);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid file keys gracefully', async () => {
      await expect(storageService.deleteFile('non-existent-key-123')).resolves.not.toThrow();
    });

    it('should validate file uploads', async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(
        storageService.uploadFile(emptyBuffer, 'tenant-test/empty.pdf', 'application/pdf'),
      ).resolves.toBeDefined();
    });
  });
});
