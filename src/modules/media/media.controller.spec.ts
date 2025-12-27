import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
    let controller: MediaController;
    let service: MediaService;

    const mockAttachment = { id: 'uuid', filename: 'test.jpg', url: 'http://s3/test.jpg' };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [MediaController],
            providers: [
                {
                    provide: MediaService,
                    useValue: {
                        uploadFile: jest.fn().mockResolvedValue(mockAttachment),
                        getPresignedUploadUrl: jest.fn().mockResolvedValue({ uploadUrl: 'http://s3/upload', attachment: mockAttachment }),
                        confirmUpload: jest.fn().mockResolvedValue(mockAttachment),
                        create: jest.fn().mockResolvedValue(mockAttachment),
                        findAll: jest.fn().mockResolvedValue([mockAttachment]),
                        findOne: jest.fn().mockResolvedValue(mockAttachment),
                        getDownloadUrl: jest.fn().mockResolvedValue('http://s3/download'),
                        findByBooking: jest.fn().mockResolvedValue([mockAttachment]),
                        findByTask: jest.fn().mockResolvedValue([mockAttachment]),
                        remove: jest.fn().mockResolvedValue(undefined),
                    },
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
        it('should call service.uploadFile', async () => {
            const file = { buffer: Buffer.from('test'), originalname: 'test.jpg', mimetype: 'image/jpeg', size: 100 } as any;
            const dto = { bookingId: 'b-1' } as any;
            await controller.uploadFile(file, dto);
            expect(service.uploadFile).toHaveBeenCalled();
        });
    });

    describe('getPresignedUploadUrl', () => {
        it('should call service.getPresignedUploadUrl', async () => {
            const dto = { filename: 'test.jpg', mimeType: 'image/jpeg' } as any;
            await controller.getPresignedUploadUrl(dto);
            expect(service.getPresignedUploadUrl).toHaveBeenCalledWith('test.jpg', 'image/jpeg', undefined, undefined);
        });
    });

    describe('confirmUpload', () => {
        it('should call service.confirmUpload', async () => {
            await controller.confirmUpload('uuid', 1024);
            expect(service.confirmUpload).toHaveBeenCalledWith('uuid', 1024);
        });
    });

    describe('create', () => {
        it('should call service.create', async () => {
            const data = { filename: 'ext.jpg', url: 'http://ext/ext.jpg' } as any;
            await controller.create(data);
            expect(service.create).toHaveBeenCalledWith(data);
        });
    });

    describe('findAll', () => {
        it('should call service.findAll', async () => {
            await controller.findAll();
            expect(service.findAll).toHaveBeenCalled();
        });
    });

    describe('findOne', () => {
        it('should call service.findOne', async () => {
            await controller.findOne('uuid');
            expect(service.findOne).toHaveBeenCalledWith('uuid');
        });
    });

    describe('getDownloadUrl', () => {
        it('should call service.getDownloadUrl', async () => {
            const result = await controller.getDownloadUrl('uuid');
            expect(service.getDownloadUrl).toHaveBeenCalledWith('uuid');
            expect(result).toEqual({ url: 'http://s3/download' });
        });
    });

    describe('findByBooking', () => {
        it('should call service.findByBooking', async () => {
            await controller.findByBooking('b-1');
            expect(service.findByBooking).toHaveBeenCalledWith('b-1');
        });
    });

    describe('findByTask', () => {
        it('should call service.findByTask', async () => {
            await controller.findByTask('t-1');
            expect(service.findByTask).toHaveBeenCalledWith('t-1');
        });
    });

    describe('remove', () => {
        it('should call service.remove', async () => {
            await controller.remove('uuid');
            expect(service.remove).toHaveBeenCalledWith('uuid');
        });
    });
});
