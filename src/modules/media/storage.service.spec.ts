import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { TEST_SECRETS } from '../../../test/secrets';
import { StorageService } from './storage.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => {
      return {
        send: mockSend,
      };
    }),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
  };
});
jest.mock('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  let service: StorageService;

  const mockConfig = {
    MINIO_ENDPOINT: 'http://localhost:9000',
    MINIO_BUCKET: 'test-bucket',
    MINIO_REGION: 'us-east-1',
    MINIO_ACCESS_KEY: 'test-access-key',
    MINIO_SECRET_KEY: TEST_SECRETS.STORAGE_SECRET_KEY,
    MINIO_PUBLIC_URL: 'http://public-url',
  };

  beforeEach(async () => {
    mockSend.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: keyof typeof mockConfig) => mockConfig[key]),
            getOrThrow: jest.fn(
              (key: keyof typeof mockConfig) => mockConfig[key],
            ),
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

      expect(mockSend).toHaveBeenCalled();
      expect(result.url).toContain('test-bucket/test-key');
    });

    it('should accept all whitelisted MIME types', async () => {
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf',
      ];
      const buffer = Buffer.from('test');
      const key = 'test-key';

      for (const mimeType of allowedTypes) {
        mockSend.mockClear();
        const result = await service.uploadFile(buffer, key, mimeType);
        expect(result.url).toBeDefined();
      }
    });

    it('should reject unsupported MIME types', async () => {
      const buffer = Buffer.from('test');
      const key = 'test-key';
      const unsupportedType = 'application/x-executable';

      await expect(
        service.uploadFile(buffer, key, unsupportedType),
      ).rejects.toThrow('Unsupported file type');
    });
  });

  describe('generateKey', () => {
    it('should generate a unique key', async () => {
      const key = await service.generateKey('test file.png');
      expect(key).toMatch(/^uploads\/\d+-[a-z0-9]+-test_file\.png$/);
    });
  });

  describe('deleteFile', () => {
    it('should send DeleteObjectCommand', async () => {
      await service.deleteFile('test-key');
      expect(mockSend).toHaveBeenCalled();
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
      const mockStream = new Readable();
      mockStream._read = jest.fn();
      mockSend.mockResolvedValue({
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
