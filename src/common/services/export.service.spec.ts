import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
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
    let mockResponse: Response;
    let mockStream: Readable;
    let setHeaderSpy: jest.Mock;

    const buildMockResponse = (): Response => {
      const passthrough = new PassThrough();
      // Drain to /dev/null so pipeline can complete its writable end.
      passthrough.resume();
      const headers = new Map<string, string>();
      const res = passthrough as unknown as Response & { setHeader: jest.Mock };
      setHeaderSpy = jest.fn((name: string, value: string) => {
        headers.set(name, value);
        return res;
      });
      res.setHeader = setHeaderSpy;
      res.status = jest.fn().mockReturnThis() as Response['status'];
      res.headersSent = false as Response['headersSent'];
      return res;
    };

    beforeEach(() => {
      mockResponse = buildMockResponse();
      mockStream = Readable.from([{ col1: 'val1' }], { objectMode: true });
    });

    it('should set proper headers', async () => {
      await service.streamFromStream(mockResponse, mockStream, 'test.csv');

      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="test.csv"');
    });

    it('should sanitize filename', async () => {
      await service.streamFromStream(mockResponse, mockStream, 'bad/file:name.csv');

      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="bad_file_name.csv"');
    });
  });
});
