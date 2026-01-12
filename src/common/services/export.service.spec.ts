import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { PassThrough, Readable } from 'stream';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportService],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('streamFromStream', () => {
    let mockResponse: Partial<Response>;
    let mockStream: Readable;

    beforeEach(() => {
      mockResponse = new PassThrough() as unknown as Response;
      mockResponse.setHeader = jest.fn();

      // Basic mock stream
      mockStream = new Readable({
        objectMode: true,
        read() {},
      });
    });

    it('should set proper headers', () => {
      service.streamFromStream(
        mockResponse as Response,
        mockStream,
        'test.csv',
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test.csv"',
      );
    });

    it('should sanitize filename', () => {
      service.streamFromStream(
        mockResponse as Response,
        mockStream,
        'bad/file:name.csv',
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="bad_file_name.csv"',
      );
    });
  });
});
