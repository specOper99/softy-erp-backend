import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards';
import { CreateAttachmentDto, PresignedUploadDto } from './dto/media.dto';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  let controller: MediaController;
  let service: MediaService;

  const mockMediaService = {
    uploadFile: jest.fn(),
    getPresignedUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getDownloadUrl: jest.fn(),
    findByBooking: jest.fn(),
    findByTask: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        {
          provide: MediaService,
          useValue: mockMediaService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MediaController>(MediaController);
    service = module.get<MediaService>(MediaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload a file', async () => {
      const file = {
        buffer: Buffer.from('test'),
        originalname: 'test.png',
        mimetype: 'image/png',
        size: 100,
      } as Express.Multer.File;
      const dto: CreateAttachmentDto = { bookingId: '1', taskId: '2' };
      const expectedResult = { id: 'file-id', url: 'http://url' };

      mockMediaService.uploadFile.mockResolvedValue(expectedResult);

      const result = await controller.uploadFile(file, dto);

      expect(service.uploadFile).toHaveBeenCalledWith({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        bookingId: dto.bookingId,
        taskId: dto.taskId,
      });
      expect(result).toBe(expectedResult);
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should return presigned url', async () => {
      const dto: PresignedUploadDto = {
        filename: 'test.png',
        mimeType: 'image/png',
      };
      const expectedResult = { uploadUrl: 'url', attachment: { id: '1' } };
      mockMediaService.getPresignedUploadUrl.mockResolvedValue(expectedResult);

      const result = await controller.getPresignedUploadUrl(dto);

      expect(service.getPresignedUploadUrl).toHaveBeenCalledWith(
        dto.filename,
        dto.mimeType,
        undefined,
        undefined,
      );
      expect(result).toBe(expectedResult);
    });
  });

  describe('confirmUpload', () => {
    it('should confirm upload', async () => {
      const id = '123';
      const size = 1000;
      const expectedResult = { id, size };
      mockMediaService.confirmUpload.mockResolvedValue(expectedResult);

      const result = await controller.confirmUpload(id, size);

      expect(service.confirmUpload).toHaveBeenCalledWith(id, size);
      expect(result).toBe(expectedResult);
    });
  });

  describe('create', () => {
    it('should create attachment link', async () => {
      const data = { url: 'http://external' };
      const expectedResult = { id: '1', ...data };
      mockMediaService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(data);
      expect(service.create).toHaveBeenCalledWith(data);
      expect(result).toBe(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should return all attachments', async () => {
      const expectedResult = [{ id: '1' }];
      mockMediaService.findAll.mockResolvedValue(expectedResult);
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toBe(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should return one attachment', async () => {
      const expectedResult = { id: '1' };
      mockMediaService.findOne.mockResolvedValue(expectedResult);
      const result = await controller.findOne('1');
      expect(service.findOne).toHaveBeenCalledWith('1');
      expect(result).toBe(expectedResult);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return download url', async () => {
      const url = 'http://download';
      mockMediaService.getDownloadUrl.mockResolvedValue(url);
      const result = await controller.getDownloadUrl('1');
      expect(service.getDownloadUrl).toHaveBeenCalledWith('1');
      expect(result).toEqual({ url });
    });
  });

  describe('findByBooking', () => {
    it('should return attachments for booking', async () => {
      const expectedResult = [{ id: '1' }];
      mockMediaService.findByBooking.mockResolvedValue(expectedResult);
      const result = await controller.findByBooking('1');
      expect(service.findByBooking).toHaveBeenCalledWith('1');
      expect(result).toBe(expectedResult);
    });
  });

  describe('findByTask', () => {
    it('should return attachments for task', async () => {
      const expectedResult = [{ id: '1' }];
      mockMediaService.findByTask.mockResolvedValue(expectedResult);
      const result = await controller.findByTask('1');
      expect(service.findByTask).toHaveBeenCalledWith('1');
      expect(result).toBe(expectedResult);
    });
  });

  describe('remove', () => {
    it('should remove attachment', async () => {
      mockMediaService.remove.mockResolvedValue(undefined);
      await controller.remove('1');
      expect(service.remove).toHaveBeenCalledWith('1');
    });
  });
});
