import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  let service: StorageService;

  const mockConfig = {
    MINIO_ENDPOINT: 'http://localhost:9000',
    MINIO_BUCKET: 'test-bucket',
    MINIO_REGION: 'us-east-1',
    MINIO_ACCESS_KEY: 'access',
    MINIO_SECRET_KEY: 'secret',
    MINIO_PUBLIC_URL: 'http://public-url',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => mockConfig[key]),
            getOrThrow: jest.fn((key) => mockConfig[key]),
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should send PutObjectCommand', async () => {
      const buffer = Buffer.from('test');
      const key = 'test-key';
      const mimeType = 'image/png';

      const result = await service.uploadFile(buffer, key, mimeType);

      expect(S3Client.prototype.send).toHaveBeenCalled();
      expect(result.url).toContain('test-bucket/test-key');
    });
  });

  describe('generateKey', () => {
    it('should generate a unique key', () => {
      const key = service.generateKey('test file.png');
      expect(key).toMatch(/^uploads\/\d+-[a-z0-9]+-test_file\.png$/);
    });
  });

  describe('deleteFile', () => {
    it('should send DeleteObjectCommand', async () => {
      await service.deleteFile('test-key');
      expect(S3Client.prototype.send).toHaveBeenCalled();
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should call getSignedUrl', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('http://signed-url');
      const result = await service.getPresignedUploadUrl('key', 'image/png');
      expect(result).toBe('http://signed-url');
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('should call getSignedUrl', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('http://signed-url');
      const result = await service.getPresignedDownloadUrl('key');
      expect(result).toBe('http://signed-url');
    });
  });

  describe('getFileStream', () => {
    it('should get file stream', async () => {
      const mockStream = { on: jest.fn() };
      (S3Client.prototype.send as jest.Mock).mockResolvedValue({
        Body: mockStream,
      });
      const result = await service.getFileStream('key');
      expect(result).toBe(mockStream);
    });
  });

  describe('extractKeyFromUrl', () => {
    it('should extract key from valid URL', () => {
      const url = 'http://public-url/test-bucket/uploads/file.png';
      const key = service.extractKeyFromUrl(url);
      expect(key).toBe('uploads/file.png');
    });

    it('should return null for invalid URL', () => {
      const url = 'http://other-url/other-bucket/file.png';
      const key = service.extractKeyFromUrl(url);
      expect(key).toBeNull();
    });
  });
});
