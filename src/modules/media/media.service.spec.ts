import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { Attachment } from './entities/attachment.entity';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';

jest.mock('../../common/utils/file-type.util', () => ({
  FileTypeUtil: {
    validateBuffer: jest.fn().mockResolvedValue({ mime: 'image/png', ext: 'png' }),
  },
}));

describe('MediaService', () => {
  let service: MediaService;
  let attachmentRepository: Repository<Attachment>;
  let storageService: StorageService;

  const mockDataSource = {
    manager: {
      findOne: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue('tenant-123');

    // Reset mocks
    mockDataSource.manager.findOne.mockReset();
    // By default, return valid entities for validation
    mockDataSource.manager.findOne.mockResolvedValue({
      id: 'valid-id',
      tenantId: 'tenant-123',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: getRepositoryToken(Attachment),
          useValue: {
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'uuid', ...entity })),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            generateKey: jest.fn().mockResolvedValue('mock-key'),
            uploadFile: jest.fn().mockResolvedValue({ url: 'http://mock-url' }),
            getPresignedUploadUrl: jest.fn().mockResolvedValue('http://presigned-url'),
            extractKeyFromUrl: jest.fn().mockReturnValue('mock-key'),
            getPresignedDownloadUrl: jest.fn().mockResolvedValue('http://download-url'),
            deleteFile: jest.fn().mockResolvedValue(undefined),
            getFileMetadata: jest.fn().mockResolvedValue({ size: 1024, contentType: 'image/png' }),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    attachmentRepository = module.get<Repository<Attachment>>(getRepositoryToken(Attachment));
    storageService = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload a file and save attachment', async () => {
      const params = {
        buffer: Buffer.from('test'),
        originalName: 'test.png',
        mimeType: 'image/png',
        size: 4,
        bookingId: 'booking-id',
      };

      const result = await service.uploadFile(params);

      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(attachmentRepository.save).toHaveBeenCalled();
      expect(result.url).toBe('http://mock-url');
      expect(result.bookingId).toBe('booking-id');
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should return a presigned URL and a pending attachment', async () => {
      const result = await service.getPresignedUploadUrl('test.png', 'image/png');

      expect(storageService.getPresignedUploadUrl).toHaveBeenCalled();
      expect(attachmentRepository.save).toHaveBeenCalled();
      expect(result.uploadUrl).toBe('http://presigned-url');
      expect(result.attachment.name).toBe('test.png');
    });
  });

  describe('confirmUpload', () => {
    it('should update attachment size', async () => {
      const mockAttachment = { id: 'uuid', name: 'test.png', url: 'mock-key', mimeType: 'image/png' } as Attachment;
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(mockAttachment);

      const result = await service.confirmUpload('uuid', 1024);

      expect(storageService.getFileMetadata).toHaveBeenCalledWith('mock-key');
      expect(attachmentRepository.save).toHaveBeenCalledWith(expect.objectContaining({ size: 1024 }));
      expect(result.size).toBe(1024);
    });

    it('should throw NotFoundException if attachment not found', async () => {
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(null);

      await expect(service.confirmUpload('invalid', 1024)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return an attachment', async () => {
      const mockAttachment = { id: 'uuid' } as Attachment;
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(mockAttachment);

      const result = await service.findOne('uuid');
      expect(result).toEqual(mockAttachment);
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(null);
      await expect(service.findOne('uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return a presigned download URL', async () => {
      const mockAttachment = {
        id: 'uuid',
        url: 'http://mock-url',
      } as Attachment;
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(mockAttachment);

      const result = await service.getDownloadUrl('uuid');

      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith('mock-key');
      expect(result).toBe('http://download-url');
    });

    it('should return original URL if key cannot be extracted', async () => {
      const mockAttachment = {
        id: 'uuid',
        url: 'http://external-url',
      } as Attachment;
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(mockAttachment);
      jest.spyOn(storageService, 'extractKeyFromUrl').mockReturnValue(null);

      const result = await service.getDownloadUrl('uuid');
      expect(result).toBe('http://external-url');
    });
  });

  describe('remove', () => {
    it('should remove attachment and delete file from storage', async () => {
      const mockAttachment = {
        id: 'uuid',
        url: 'http://mock-url',
      } as Attachment;
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(mockAttachment);

      await service.remove('uuid');

      expect(storageService.deleteFile).toHaveBeenCalledWith('mock-key');
      expect(attachmentRepository.remove).toHaveBeenCalledWith(mockAttachment);
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(null);
      await expect(service.remove('uuid')).rejects.toThrow(NotFoundException);
    });

    it('should handle storage delete failures gracefully', async () => {
      const mockAttachment = {
        id: 'uuid',
        url: 'http://mock-url',
      } as Attachment;
      jest.spyOn(attachmentRepository, 'findOne').mockResolvedValue(mockAttachment);
      (storageService.deleteFile as jest.Mock).mockRejectedValue(new Error('Storage fail'));

      await service.remove('uuid');
      expect(attachmentRepository.remove).toHaveBeenCalledWith(mockAttachment);
    });
  });

  describe('findByBooking', () => {
    it('should call repository.find with bookingId', async () => {
      const mockAttachments = [{ id: '1' }] as Attachment[];
      jest.spyOn(attachmentRepository, 'find').mockResolvedValue(mockAttachments);

      const result = await service.findByBooking('b-id');
      expect(attachmentRepository.find).toHaveBeenCalledWith({
        where: { bookingId: 'b-id', tenantId: 'tenant-123' },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      expect(result).toBe(mockAttachments);
    });
  });

  describe('findByTask', () => {
    it('should call repository.find with taskId', async () => {
      const mockAttachments = [{ id: '1' }] as Attachment[];
      jest.spyOn(attachmentRepository, 'find').mockResolvedValue(mockAttachments);

      const result = await service.findByTask('t-id');
      expect(attachmentRepository.find).toHaveBeenCalledWith({
        where: { taskId: 't-id', tenantId: 'tenant-123' },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      expect(result).toBe(mockAttachments);
    });
  });

  describe('create', () => {
    it('should create and save an attachment', async () => {
      const data = { name: 'external' };
      const result = await service.create(data);
      expect(attachmentRepository.create).toHaveBeenCalledWith(data);
      expect(attachmentRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('uuid');
    });
  });

  describe('findAll', () => {
    it('should call repository.find', async () => {
      await service.findAll();
      expect(attachmentRepository.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        relations: ['booking', 'task'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });
  });
});
